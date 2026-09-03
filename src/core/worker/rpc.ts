import { encode, decode } from 'msgpackr';

export const MAX_PAYLOAD_BYTES = 1024 * 1024;

let correlationCounter = 0;

export function nextCorrelationId(): string {
    correlationCounter += 1;
    return `rpc-${Date.now()}-${correlationCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export interface RPCRequest {
    kind: 'request';
    pluginId: string;
    method: string;
    correlationId: string;
    payload: unknown;
}

export interface RPCResponse {
    kind: 'response';
    correlationId: string;
    result: unknown;
}

export type RPCMessage = RPCRequest | RPCResponse;

export function createRequest(pluginId: string, method: string, payload: unknown): RPCRequest {
    return { kind: 'request', pluginId, method, correlationId: nextCorrelationId(), payload };
}

export function createResponse(correlationId: string, result: unknown): RPCResponse {
    return { kind: 'response', correlationId, result };
}

export function isRequest(msg: unknown): msg is RPCRequest {
    return !!(msg && typeof msg === 'object' && 'kind' in msg && msg.kind === 'request');
}

export function isResponse(msg: unknown): msg is RPCResponse {
    return !!(msg && typeof msg === 'object' && 'kind' in msg && msg.kind === 'response');
}

export function isOversize(msg: unknown): boolean {
    return Buffer.byteLength(encode(msg as object)) > MAX_PAYLOAD_BYTES;
}

export function serialize(payload: unknown): Buffer {
    return encode(payload);
}

export function deserialize<T = unknown>(data: Buffer): T {
    return decode(data) as T;
}

export default {
    MAX_PAYLOAD_BYTES,
    nextCorrelationId,
    createRequest,
    createResponse,
    isRequest,
    isResponse,
    isOversize,
    serialize,
    deserialize
};