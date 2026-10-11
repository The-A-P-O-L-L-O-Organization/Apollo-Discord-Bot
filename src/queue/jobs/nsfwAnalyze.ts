// NSFW Analysis Job - Uses Rust gRPC worker when NSFW_USE_RUST=true

import { createHash } from 'node:crypto';
import { logger } from '../../utils/logger.js';
import { registerHandler } from '../jobHandler.js';
import { createQueue } from '../queue.js';
import type { NSFWAnalyzeJobData } from '../../types/queue.js';
import { analyzeImageGrpc } from '../nsfwClient.js';

export const JobNames = {
    NSFW_ANALYZE: 'nsfw:analyze'
} as const;

export const NSFW_DEDUPE_TTL_MS = 300000;

export interface NsfwEnqueueOptions {
    userId?: string;
    attachmentName?: string;
    attachmentId?: string;
}

export function buildNsfwJobId(imageUrl: string, guildId?: string): string {
    const material = typeof guildId === 'string' && guildId.length > 0 ? `${guildId}:${imageUrl}` : imageUrl;
    const hash = createHash('sha256').update(material).digest('hex').slice(0, 32);
    return `nsfw:${hash}`;
}

export async function enqueueNsfwAnalysis(
    imageUrl: string,
    guildId: string,
    threshold = 0.6,
    options: NsfwEnqueueOptions = {}
): Promise<NSFWAnalyzeJobData> {
    const jobId = buildNsfwJobId(imageUrl, guildId);
    const data: NSFWAnalyzeJobData = {
        imageUrl,
        guildId,
        threshold,
        ...(typeof options.attachmentName === 'string' ? { attachmentName: options.attachmentName } : {}),
        ...(typeof options.attachmentId === 'string' ? { attachmentId: options.attachmentId } : {})
    };
    const queue = await createQueue(JobNames.NSFW_ANALYZE);
    await queue.add(JobNames.NSFW_ANALYZE, data, {
        jobId,
        deduplication: {
            id: jobId,
            ttl: NSFW_DEDUPE_TTL_MS
        },
        attempts: 2,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400, count: 100 }
    });
    return data;
}

export default function register(): void {
    registerHandler(JobNames.NSFW_ANALYZE, async (job: { data: { imageUrl: string; threshold?: number; guildId: string; userId?: string; attachmentName?: string; attachmentId?: string } }) => {
        const { imageUrl, threshold = 0.6, guildId, userId = '' } = job.data;

        logger.info({ msg: `[Worker] Processing NSFW analysis for guild ${guildId}` });

        try {
            // Use Rust gRPC worker if enabled
            if (process.env['NSFW_USE_RUST'] === 'true') {
                const response = await analyzeImageGrpc(imageUrl, threshold, guildId, userId);

                logger.info({ msg: `[Worker] NSFW analysis complete for ${imageUrl}: isNsfw=${response.isNsfw}` });

                return {
                    status: 'completed',
                    isNsfw: response.isNsfw,
                    predictions: response.predictions,
                    imageUrl,
                    threshold,
                    inferenceMs: response.inferenceMs,
                    maxConfidence: response.maxConfidence
                };
            }

            // TFJS fallback removed - NSFW_USE_RUST must be enabled for NSFW detection
            logger.warn({ msg: `[Worker] NSFW_USE_RUST not enabled, skipping analysis for ${imageUrl}` });
            return { status: 'skipped', reason: 'NSFW_USE_RUST not enabled', isNsfw: false };
        } catch (error) {
            logger.error({ err: error as Error, msg: `[Worker] NSFW analysis error for ${imageUrl}` });
            return { status: 'error', reason: (error as Error).message, isNsfw: false };
        }
    });
}