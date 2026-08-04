import { createRelationalOperationProtocol } from "@red-cup-engineering/a2a-sovereign-operation-boundary-service";
export const discoveryServiceProtocol = createRelationalOperationProtocol({
  requestKind: "org.emsenn.topical-knowledge-cell-discovery-service.request.v1",
  responseKind: "org.emsenn.topical-knowledge-cell-discovery-service.response.v1",
  label: "discovery-service protocol",
});
export const encodeRequest = discoveryServiceProtocol.encodeRequest;
export const decodeRequest = discoveryServiceProtocol.decodeRequest;
export const encodeResponse = discoveryServiceProtocol.encodeResponse;
export const decodeResponse = discoveryServiceProtocol.decodeResponse;
