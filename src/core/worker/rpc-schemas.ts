import { z } from 'zod';

export const MAX_PAYLOAD_BYTES = 1024 * 1024;

export const RPCRequestSchema = z.object({
    kind: z.literal('request'),
    pluginId: z.string(),
    method: z.string(),
    correlationId: z.string(),
    payload: z.unknown(),
});

export const RPCResponseSchema = z.object({
    kind: z.literal('response'),
    correlationId: z.string(),
    result: z.unknown(),
});

export const RPCMessageSchema = z.union([RPCRequestSchema, RPCResponseSchema]);

export type RPCRequest = z.infer<typeof RPCRequestSchema>;
export type RPCResponse = z.infer<typeof RPCResponseSchema>;
export type RPCMessage = z.infer<typeof RPCMessageSchema>;

export function createRequest(pluginId: string, method: string, payload: unknown): RPCRequest {
    return { kind: 'request', pluginId, method, correlationId: `rpc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, payload };
}

export function createResponse(correlationId: string, result: unknown): RPCResponse {
    return { kind: 'response', correlationId, result };
}

export function isRequest(msg: unknown): msg is RPCRequest {
    return RPCRequestSchema.safeParse(msg).success;
}

export function isResponse(msg: unknown): msg is RPCResponse {
    return RPCResponseSchema.safeParse(msg).success;
}

export function validateRequest(msg: unknown): { success: true; data: RPCRequest } | { success: false; error: z.ZodError } {
    const result = RPCRequestSchema.safeParse(msg);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
}

export function validateResponse(msg: unknown): { success: true; data: RPCResponse } | { success: false; error: z.ZodError } {
    const result = RPCResponseSchema.safeParse(msg);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
}

export function validateMessage(msg: unknown): { success: true; data: RPCMessage } | { success: false; error: z.ZodError } {
    const result = RPCMessageSchema.safeParse(msg);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return { success: false, error: result.error };
}