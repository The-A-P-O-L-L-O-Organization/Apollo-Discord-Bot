// NSFW Analysis Job - Uses Rust gRPC worker when NSFW_USE_RUST=true

import { logger } from '../../utils/logger.js';
import { registerHandler } from '../jobHandler.js';
import { analyzeImageGrpc } from '../nsfwClient.js';

export const JobNames = {
    NSFW_ANALYZE: 'nsfw:analyze'
} as const;

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