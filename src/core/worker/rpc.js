export const MAX_PAYLOAD_BYTES = 1024 * 1024;

let correlationCounter = 0;

export function nextCorrelationId() {
    correlationCounter += 1;
    return `rpc-${Date.now()}-${correlationCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createRequest(pluginId, method, payload) {
    return { kind: 'request', pluginId, method, correlationId: nextCorrelationId(), payload };
}

export function createResponse(correlationId, result) {
    return { kind: 'response', correlationId, result };
}

export function isRequest(msg) {
    return !!(msg && msg.kind === 'request');
}

export function isResponse(msg) {
    return !!(msg && msg.kind === 'response');
}

export function isOversize(msg) {
    return Buffer.byteLength(JSON.stringify(msg)) > MAX_PAYLOAD_BYTES;
}

export function serialize(payload) {
    return JSON.stringify(payload);
}

export function deserialize(text) {
    return JSON.parse(text);
}
