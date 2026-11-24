const ACTOR = "urn:ame:topical-knowledge-cell-discovery-service";
const SCOPES = new Set(["enterprise", "state", "nation", "colony", "union", "public"]);
const DISCLOSURES = new Set(["public", "customer-confidential", "provider-private"]);
export const FORBIDDEN_AUTHORITIES = Object.freeze(["notebook-creation", "corpus-mutation", "sharing", "deletion", "publication", "report-generation", "payment-settlement"]);

function fail(message) { throw new TypeError(message); }
function exact(value, required) { if (!value || Object.getPrototypeOf(value) !== Object.prototype) fail("plain record required"); const keys = Object.keys(value); for (const key of required) if (!Object.hasOwn(value, key)) fail(`missing ${key}`); for (const key of keys) if (!required.includes(key)) fail(`unexpected ${key}`); }
function text(value, name) { if (typeof value !== "string" || value.trim() === "") fail(`${name} must be exact and nonempty`); return value; }
function time(value, name) { text(value, name); const parsed = Date.parse(value); if (!Number.isFinite(parsed)) fail(`${name} must be an exact instant`); return parsed; }
function endpoint(value) { exact(value, ["endpointId", "agentCardUrl", "expectedIssuer"]); text(value.endpointId, "endpointId"); text(value.expectedIssuer, "expectedIssuer"); try { const url = new URL(value.agentCardUrl); if (!/^https?:$/u.test(url.protocol)) fail("manifest endpoint must be HTTP(S)"); } catch { fail("manifest endpoint must be an absolute HTTP(S) URL"); } return value; }
function bodyOf(value) { const { id, ...body } = value; return body; }
async function manifest(value, route, providers) {
  exact(value, ["id", "type", "issuer", "cellId", "ownerEnterprise", "scopeKind", "authorityMode", "custodyAssignment", "notebookProvider", "corpusSourceSetId", "disclosureClass", "observedAt", "validUntil", "predecessorManifest", "endpoint"]);
  if (value.type !== "TopicalKnowledgeCellManifest") fail("wrong manifest type");
  for (const key of ["issuer", "cellId", "ownerEnterprise", "custodyAssignment", "notebookProvider", "corpusSourceSetId", "endpoint"]) text(value[key], key);
  if (value.issuer !== route.expectedIssuer) fail("manifest issuer differs from admitted endpoint");
  if (value.endpoint !== route.agentCardUrl) fail("manifest is not bound to its admitted endpoint");
  if (!SCOPES.has(value.scopeKind) || value.authorityMode !== "non-authoritative-projection") fail("manifest claims an unknown or authoritative scope");
  if (!DISCLOSURES.has(value.disclosureClass)) fail("manifest has unknown disclosure class");
  time(value.observedAt, "observedAt"); if (time(value.validUntil, "validUntil") < time(value.observedAt, "observedAt")) fail("manifest validity precedes observation");
  if (value.predecessorManifest !== null) text(value.predecessorManifest, "predecessorManifest");
  const identity = await providers.identify(bodyOf(value)); if (identity.id !== value.id) fail("manifest content identity changed");
  return value;
}

export async function discoverTopicalKnowledgeCells(request, providers, options = {}) {
  exact(request, ["type", "requestId", "actor", "endpoints", "maximumAgeSeconds", "evaluatedAt", "authorization"]);
  if (request.type !== "TopicalKnowledgeCellDiscoveryRequest") fail("wrong discovery request type"); text(request.requestId, "requestId"); text(request.actor, "actor");
  if (!Array.isArray(request.endpoints) || request.endpoints.length === 0 || request.endpoints.length > (options.maximumEndpoints ?? 64)) fail("one bounded endpoint denominator is required");
  const routes = request.endpoints.map(endpoint).sort((a, b) => a.endpointId.localeCompare(b.endpointId));
  if (new Set(routes.map((item) => item.endpointId)).size !== routes.length || new Set(routes.map((item) => item.agentCardUrl)).size !== routes.length) fail("endpoint denominator contains duplicates");
  if (!Number.isSafeInteger(request.maximumAgeSeconds) || request.maximumAgeSeconds < 1 || request.maximumAgeSeconds > (options.maximumAgeSeconds ?? 31_536_000)) fail("maximumAgeSeconds is outside the admitted bound");
  const evaluatedAt = time(request.evaluatedAt, "evaluatedAt"), auth = request.authorization;
  if (!providers || typeof providers.identify !== "function" || typeof providers.discover !== "function" || typeof providers.lookupRequest !== "function" || typeof providers.record !== "function") fail("contracted discovery, identity, and WitnessJournal providers are required");
  const bodyIdentity = await providers.identify({ type: request.type, requestId: request.requestId, actor: request.actor, endpoints: routes, maximumAgeSeconds: request.maximumAgeSeconds, evaluatedAt: request.evaluatedAt });
  exact(auth, ["holder", "operation", "requestId", "requestBodyId", "expiresAt", "nondelegable", "singleUse"]);
  if (auth.holder !== request.actor || auth.operation !== "discover-topical-knowledge-cells" || auth.requestId !== request.requestId || auth.requestBodyId !== bodyIdentity.id) fail("discovery authority is not bound to the exact actor, operation, and request body");
  if (auth.nondelegable !== true || auth.singleUse !== true) fail("discovery authority must be nondelegable and single-use");
  const requestIdentity = await providers.identify({ ...request, endpoints: routes }), incumbent = await providers.lookupRequest(request.requestId);
  if (incumbent && incumbent.requestIdentity !== requestIdentity.id) fail("request identity collision"); if (incumbent) return incumbent.snapshot;
  if (time(auth.expiresAt, "authorization expiry") <= Date.parse(options.now ?? new Date().toISOString())) fail("discovery authority expired");
  const fresh = [], stale = [], refused = [];
  for (const route of routes) {
    try {
      const found = await providers.discover(route);
      if (found?.verified !== true || found?.issuer !== route.expectedIssuer || typeof found?.signatureEvidence !== "string") fail("signed discovery evidence is absent or mismatched");
      const item = await manifest(found.manifest, route, providers), ageSeconds = (evaluatedAt - Date.parse(item.observedAt)) / 1000;
      if (ageSeconds < 0) fail("manifest observation is later than the evaluation instant");
      const entry = { endpointId: route.endpointId, manifest: item, signatureEvidence: found.signatureEvidence, ageSeconds };
      if (evaluatedAt > Date.parse(item.validUntil) || ageSeconds > request.maximumAgeSeconds) stale.push(entry); else fresh.push(entry);
    } catch (error) { refused.push({ endpointId: route.endpointId, reason: String(error?.message ?? error) }); }
  }
  const byCell = new Map(); for (const entry of fresh) { const values = byCell.get(entry.manifest.cellId) ?? []; values.push(entry); byCell.set(entry.manifest.cellId, values); }
  const contradictoryIds = new Set();
  for (const values of byCell.values()) if (new Set(values.map(({ manifest: item }) => `${item.custodyAssignment}\0${item.notebookProvider}\0${item.corpusSourceSetId}`)).size > 1) for (const value of values) contradictoryIds.add(value.endpointId);
  const contradictory = fresh.filter((item) => contradictoryIds.has(item.endpointId)), admittedFresh = fresh.filter((item) => !contradictoryIds.has(item.endpointId));
  const body = { type: "TopicalKnowledgeCellDiscoverySnapshot", version: 1, provider: ACTOR, request: requestIdentity.id, requestId: request.requestId, evaluatedAt: request.evaluatedAt, denominator: routes.map((item) => item.endpointId), completeness: "supplied-denominator-only", fresh: admittedFresh, stale, refused, contradictory, forbiddenAuthorities: Object.fromEntries(FORBIDDEN_AUTHORITIES.map((name) => [name, false])) };
  const snapshotIdentity = await providers.identify(body), snapshot = Object.freeze({ id: snapshotIdentity.id, ...body });
  await providers.record({ type: "TopicalKnowledgeCellDiscoveryReceipt", actor: ACTOR, requestId: request.requestId, requestIdentity: requestIdentity.id, snapshot, recordedAt: options.now ?? new Date().toISOString() }); return snapshot;
}
