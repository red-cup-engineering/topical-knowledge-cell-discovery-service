import assert from "node:assert/strict";
import test from "node:test";
import { Message, Role } from "@a2a-js/sdk";
import { extractRmnPart, rmnPart } from "@red-cup-engineering/a2a-rmn-part-service";
import { decodeSemantic, semanticBytes } from "@red-cup-engineering/relation-model-notation-cbor-codec";
import { executeA2aMessage } from "../scripts/execute-a2a-task.mjs";
import { discoveryServiceProtocol as protocol } from "../src/protocol.mjs";
function message(operation) { const request = protocol.encodeRequest(operation, {}); return Message.toJSON({ messageId: "one", contextId: "", taskId: "", role: Role.ROLE_USER, parts: [rmnPart(semanticBytes(request.term))], metadata: {}, extensions: [], referenceTaskIds: [] }); }
function response(output) { return protocol.decodeResponse(decodeSemantic(extractRmnPart(Message.fromJSON(output).parts).bytes)); }
test("discovery face refuses before endpoint and witness providers activate", async () => {
  const result = response(await executeA2aMessage(message("discover-topical-knowledge-cells"), async () => { throw new Error("discovery-service deployment is not activated"); }));
  assert.equal(result.disposition, "refused"); assert.match(result.reason, /not activated/u);
});
test("discovery face does not admit report generation", async () => {
  let loaded = false; const result = response(await executeA2aMessage(message("execute-report"), async () => { loaded = true; return {}; }));
  assert.equal(loaded, false); assert.match(result.reason, /unknown discovery-service operation/u);
});
