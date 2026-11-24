import { resolve } from "node:path";
import { loadBoundRuntime } from "@red-cup-engineering/a2a-sovereign-operation-boundary-service";
const ROOT = resolve(import.meta.dirname, "..");
export function loadDiscoveryRuntime(boundaryPath = process.env.TOPICAL_DISCOVERY_BOUNDARY ?? resolve(ROOT, "content/deployment/runtime-boundary.json")) {
  return loadBoundRuntime({ boundaryPath, boundaryType: "DeploymentBoundary", factoryExport: "createTopicalKnowledgeCellDiscoveryRuntime", root: ROOT, inactiveMessage: "discovery-service deployment is not activated" });
}
