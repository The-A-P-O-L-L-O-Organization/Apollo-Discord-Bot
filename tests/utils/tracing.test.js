import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

import {
    generateTraceId,
    generateSpanId,
    runWithTrace,
    getTraceContext,
    getTraceId,
    getSpanId,
    getParentSpanId,
    createChildSpan,
    runWithSpan,
    addSpanAttributes,
    getSpanAttributes,
    createTraceContext,
    traceMiddleware,
    traceInteraction,
    traceJob
} from '../../src/utils/tracing.js';

describe('Distributed Tracing', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        // Clear any trace context
    });

    describe('ID Generation', () => {
        it('should generate unique trace IDs', () => {
            const id1 = generateTraceId();
            const id2 = generateTraceId();
            expect(id1).not.toBe(id2);
            expect(id1).toHaveLength(36); // UUID format
        });

        it('should generate unique span IDs', () => {
            const id1 = generateSpanId();
            const id2 = generateSpanId();
            expect(id1).not.toBe(id2);
            expect(id1).toHaveLength(16); // Truncated UUID
        });
    });

    describe('Trace Context', () => {
        it('should return null when no trace context', () => {
            expect(getTraceContext()).toBeNull();
            expect(getTraceId()).toBeNull();
            expect(getSpanId()).toBeNull();
            expect(getParentSpanId()).toBeNull();
        });

        it('should run function with trace context', async() => {
            const ctx = createTraceContext();
            const result = await runWithTrace(ctx, async() => {
                expect(getTraceId()).toBe(ctx.traceId);
                expect(getSpanId()).toBe(ctx.spanId);
                return 'success';
            });
            expect(result).toBe('success');
        });

        it('should not leak trace context after run', async() => {
            const ctx = createTraceContext();
            await runWithTrace(ctx, async() => {
                expect(getTraceId()).toBe(ctx.traceId);
            });
            expect(getTraceContext()).toBeNull();
        });
    });

    describe('Child Spans', () => {
        it('should create child span with parent context', async() => {
            const parentCtx = createTraceContext();
            await runWithTrace(parentCtx, async() => {
                const childSpan = createChildSpan({ name: 'child-operation', attributes: { key: 'value' } });
                
                expect(childSpan.traceId).toBe(parentCtx.traceId);
                expect(childSpan.spanId).not.toBe(parentCtx.spanId);
                expect(childSpan.parentSpanId).toBe(parentCtx.spanId);
                expect(childSpan.name).toBe('child-operation');
                expect(childSpan.attributes.key).toBe('value');
            });
        });

        it('should run function with child span context', async() => {
            const parentCtx = createTraceContext();
            await runWithTrace(parentCtx, async() => {
                const childSpan = createChildSpan({ name: 'child-operation' });
                
                const result = await runWithSpan(childSpan, async() => {
                    expect(getTraceId()).toBe(parentCtx.traceId);
                    expect(getSpanId()).toBe(childSpan.spanId);
                    expect(getParentSpanId()).toBe(parentCtx.spanId);
                    return 'child-result';
                });
                expect(result).toBe('child-result');
            });
        });
    });

    describe('Span Attributes', () => {
        it('should add and get span attributes', async() => {
            const ctx = createTraceContext();
            await runWithTrace(ctx, async() => {
                addSpanAttributes({ 'http.method': 'GET', 'http.url': '/test' });
                const attrs = getSpanAttributes();
                expect(attrs['http.method']).toBe('GET');
                expect(attrs['http.url']).toBe('/test');
            });
        });

        it('should merge attributes', async() => {
            const ctx = createTraceContext();
            await runWithTrace(ctx, async() => {
                addSpanAttributes({ 'key1': 'value1' });
                addSpanAttributes({ 'key2': 'value2' });
                const attrs = getSpanAttributes();
                expect(attrs.key1).toBe('value1');
                expect(attrs.key2).toBe('value2');
            });
        });
    });

    describe('createTraceContext', () => {
        it('should create context with provided traceId and parentSpanId', () => {
            const ctx = createTraceContext({ traceId: 'custom-trace', parentSpanId: 'custom-parent' });
            expect(ctx.traceId).toBe('custom-trace');
            expect(ctx.parentSpanId).toBe('custom-parent');
            expect(ctx.spanId).toBeDefined();
            expect(ctx.attributes).toEqual({});
        });

        it('should generate IDs when not provided', () => {
            const ctx = createTraceContext();
            expect(ctx.traceId).toBeDefined();
            expect(ctx.spanId).toBeDefined();
            expect(ctx.parentSpanId).toBeNull();
        });
    });

    describe('traceMiddleware', () => {
        it('should create middleware function', () => {
            const middleware = traceMiddleware();
            expect(typeof middleware).toBe('function');
        });

        it('should extract trace headers and run with context', async() => {
            const req = {
                headers: {
                    'x-trace-id': 'test-trace-id',
                    'x-parent-span-id': 'test-parent-span',
                    'user-agent': 'test-agent'
                },
                method: 'GET',
                url: '/test',
                path: '/test',
                route: { path: '/test' }
            };
            const res = {
                setHeader: vi.fn()
            };
            let nextCalled = false;
            const next = () => { nextCalled = true; };

            const middleware = traceMiddleware();
            await new Promise(resolve => {
                middleware(req, res, () => {
                    expect(getTraceId()).toBe('test-trace-id');
                    expect(getParentSpanId()).toBe('test-parent-span');
                    expect(getSpanAttributes()['http.method']).toBe('GET');
                    expect(res.setHeader).toHaveBeenCalledWith('x-trace-id', 'test-trace-id');
                    next();
                    resolve();
                });
            });
            expect(nextCalled).toBe(true);
        });
    });

    describe('traceInteraction', () => {
        it('should wrap interaction handler with tracing', async() => {
            const mockInteraction = {
                type: 2,
                commandName: 'test-command',
                guildId: 'guild-123',
                channelId: 'channel-456',
                user: { id: 'user-789' },
                customId: 'trace-123:span-456'
            };

            const handler = vi.fn().mockResolvedValue('handled');
            const wrapped = traceInteraction(handler);

            const result = await wrapped(mockInteraction);
            expect(result).toBe('handled');
            expect(handler).toHaveBeenCalledWith(mockInteraction);
        });
    });

    describe('traceJob', () => {
        it('should wrap job processor with tracing', async() => {
            const mockJob = {
                name: 'test-job',
                id: 'job-123',
                queueName: 'test-queue',
                data: { traceId: 'job-trace', spanId: 'job-span', payload: 'data' }
            };

            const processor = vi.fn().mockResolvedValue('processed');
            const wrapped = traceJob(processor);

            const result = await wrapped(mockJob);
            expect(result).toBe('processed');
            expect(processor).toHaveBeenCalledWith(mockJob);
        });
    });
});