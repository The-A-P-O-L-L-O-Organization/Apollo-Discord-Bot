// NSFW Analysis Job - TypeScript migration

import { logger } from '../../utils/logger.js';
import { initializeNsfwModel, analyzeImage, isImageNsfw } from '../../utils/nsfwDetection.js';
import { registerHandler } from '../jobHandler.js';

export const JobNames = {
    NSFW_ANALYZE: 'nsfw:analyze'
} as const;

export default function register(): void {
    registerHandler(JobNames.NSFW_ANALYZE, async (job: { data: { imageUrl: string; threshold?: number; guildId: string; attachmentName?: string; attachmentId?: string } }) => {
        const { imageUrl, threshold = 0.6, guildId } = job.data;

        logger.info({ msg: `[Worker] Processing NSFW analysis for guild ${guildId}` });

        try {
            // Ensure model is initialized
            await initializeNsfwModel();

            const predictions = await analyzeImage(imageUrl);

            if (!predictions) {
                logger.warn({ msg: `[Worker] NSFW analysis failed for ${imageUrl}` });
                return { status: 'error', reason: 'analysis_failed', isNsfw: false };
            }

            const isNsfw = isImageNsfw(predictions, threshold);

            logger.info({ msg: `[Worker] NSFW analysis complete for ${imageUrl}: isNsfw=${isNsfw}` });

            return {
                status: 'completed',
                isNsfw,
                predictions,
                imageUrl,
                threshold
            };
        } catch (error) {
            logger.error({ err: error as Error, msg: `[Worker] NSFW analysis error for ${imageUrl}` });
            return { status: 'error', reason: (error as Error).message, isNsfw: false };
        }
    });
}