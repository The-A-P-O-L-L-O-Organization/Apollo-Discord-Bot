import { encode, decode } from 'msgpackr';
import type { RPCRequest, RPCResponse, RPCMessage } from './rpc-schemas.js';
import {
    createRequest as createRequestZod,
    createResponse as createResponseZod,
    isRequest as isRequestZod,
    isResponse as isResponseZod,
    validateRequest,
    validateResponse,
    validateMessage
} from './rpc-schemas.js';

export const MAX_PAYLOAD_BYTES = 1024 * 1024;

let correlationCounter = 0;

export function nextCorrelationId(): string {
    correlationCounter += 1;
    return `rpc-${Date.now()}-${correlationCounter}-${Math.random().toString(36).slice(2, 8)}`;
}

export type { RPCRequest, RPCResponse, RPCMessage };

export function createRequest(pluginId: string, method: string, payload: unknown): RPCRequest {
    return createRequestZod(pluginId, method, payload);
}

export function createResponse(correlationId: string, result: unknown): RPCResponse {
    return createResponseZod(correlationId, result);
}

export function isRequest(msg: unknown): msg is RPCRequest {
    return isRequestZod(msg);
}

export function isResponse(msg: unknown): msg is RPCResponse {
    return isResponseZod(msg);
}

export { validateRequest, validateResponse, validateMessage };

export function isOversize(msg: unknown): boolean {
    return Buffer.byteLength(encode(msg)) > MAX_PAYLOAD_BYTES;
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
    validateRequest,
    validateResponse,
    validateMessage,
    isOversize,
    serialize,
    deserialize
};