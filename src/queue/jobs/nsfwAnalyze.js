import { logger } from '../../utils/logger.js';
import { initializeNsfwModel, analyzeImage, isImageNsfw } from '../../utils/nsfwDetection.js';

export const JobNames = {
    NSFW_ANALYZE: 'nsfw:analyze'
};

export default function register() {
    registerHandler(JobNames.NSFW_ANALYZE, async(job) => {
        const { imageUrl, threshold = 0.6, guildId } = job.data;
        
        logger.info(`[Worker] Processing NSFW analysis for guild ${guildId}`);

        try {
            // Ensure model is initialized
            await initializeNsfwModel();
            
            const predictions = await analyzeImage(imageUrl);
            
            if (!predictions) {
                logger.warn(`[Worker] NSFW analysis failed for ${imageUrl}`);
                return { status: 'error', reason: 'analysis_failed', isNsfw: false };
            }

            const isNsfw = isImageNsfw(predictions, threshold);
            
            logger.info(`[Worker] NSFW analysis complete for ${imageUrl}: isNsfw=${isNsfw}`);
            
            return { 
                status: 'completed', 
                isNsfw, 
                predictions,
                imageUrl,
                threshold 
            };
        } catch (error) {
            logger.error(`[Worker] NSFW analysis error for ${imageUrl}:`, error.message);
            return { status: 'error', reason: error.message, isNsfw: false };
        }
    });
}

// Import registerHandler from jobHandler
import { registerHandler } from '../jobHandler.js';