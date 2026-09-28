import { z, type ZodType, type ZodError } from 'zod';

export interface ValidationResult<T> {
    data: T;
    success: true;
}

export interface ValidationError {
    success: false;
    error: ZodError;
    path: string;
}

function formatZodError(error: ZodError): string {
    const formatted = error.format();
    const paths: string[] = [];
    
    function extractPaths(obj: unknown, prefix = ''): void {
        if (obj && typeof obj === 'object') {
            for (const [key, value] of Object.entries(obj)) {
                if (key === '_errors' && Array.isArray(value)) {
                    if (value.length > 0) {
                        paths.push(prefix);
                    }
                } else if (typeof value === 'object' && value !== null) {
                    extractPaths(value, prefix ? `${prefix}.${key}` : key);
                }
            }
        }
    }
    
    extractPaths(formatted);
    return paths.join(', ');
}

export function validateRequest<T>(schema: ZodType<T>, payload: unknown): T {
    const result = schema.safeParse(payload);
    if (!result.success) {
        const error = result.error as ZodError;
        const path = formatZodError(error);
        throw new Error(`Request validation failed: ${error.message}${path ? ` at ${path}` : ''}`);
    }
    return result.data;
}

export function validateResponse<T>(schema: ZodType<T>, payload: unknown): T {
    const result = schema.safeParse(payload);
    if (!result.success) {
        const error = result.error as ZodError;
        const path = formatZodError(error);
        throw new Error(`Response validation failed: ${error.message}${path ? ` at ${path}` : ''}`);
    }
    return result.data;
}

export function createValidationMiddleware<T>(schema: ZodType<T>) {
    return (payload: unknown): T => validateRequest(schema, payload);
}