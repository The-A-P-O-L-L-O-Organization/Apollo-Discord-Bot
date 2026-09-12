// NSFW Detection Utility
// Scans image attachments for NSFW content using TensorFlow.js
import { logger } from '../utils/logger.js';
import type { SafeFetchResult } from './safeFetch.js';
import { safeFetch } from './safeFetch.js';
import { getGuildData } from './db.js';
import { createQueue } from '../queue/queue.js';
import { JobNames } from '../queue/queue.js';

let model: any = null;
let modelLoaded = false;
let modelPromise: Promise<boolean> | null = null;
let tfModule: any = null;

/**
 * Initializes the NSFW detection model
 * @returns Whether initialization was successful
 */
export async function initializeNsfwModel(): Promise<boolean> {
    if (modelPromise) {return modelPromise;}
    modelPromise = (async () => {
        try {
            logger.info({ msg: '[INFO] Loading NSFW detection model...' });
            tfModule = await import('@tensorflow/tfjs-node');
            const nsfwjs = await import('nsfwjs');
            model = await nsfwjs.load();
            modelLoaded = true;
            logger.info({ msg: '[INFO] NSFW detection model loaded successfully' });
            return true;
        } catch (error) {
            logger.error({ err: error as Error, msg: '[ERROR] Failed to load NSFW detection model' });
            modelLoaded = false;
            modelPromise = null;
            return false;
        }
    })();
    return modelPromise;
}

/**
 * Checks if NSFW detection is available
 * @returns Whether model is loaded
 */
export function isNsfwDetectionAvailable(): boolean {
    return modelLoaded && model !== null;
}

interface NsfwConfig {
    enabled: boolean;
    threshold: number;
    deleteMessages: boolean;
    warnOnDetection: boolean;
    exemptNsfwChannels: boolean;
}

/**
 * Gets NSFW detection configuration for a guild
 * @param guildId - The guild ID
 * @returns Configuration
 */
export async function getNsfwConfig(guildId: string): Promise<NsfwConfig> {
    const guildConfig = await getGuildData('nsfw-config', guildId) as Partial<NsfwConfig> | null;
    return {
        enabled: guildConfig?.enabled ?? false,
        threshold: guildConfig?.threshold ?? 0.6,
        deleteMessages: guildConfig?.deleteMessages ?? true,
        warnOnDetection: guildConfig?.warnOnDetection ?? false,
        exemptNsfwChannels: guildConfig?.exemptNsfwChannels ?? true
    };
}

/**
 * Downloads an image from URL
 * @param url - Image URL
 * @returns Image buffer
 */
async function downloadImage(url: string): Promise<Buffer> {
    const result = await safeFetch(url, {
        maxBytes: 10 * 1024 * 1024,
        timeoutMs: 10000,
        skipDnsCheck: true
    }) as SafeFetchResult;
    return result.buffer;
}

/**
 * Analyzes an image for NSFW content
 * @param imageUrl - URL of the image to analyze
 * @returns Analysis result or null
 */
export async function analyzeImage(imageUrl: string): Promise<Record<string, number> | null> {
    if (!isNsfwDetectionAvailable()) {
        return null;
    }

    try {
        // Download image
        const imageBuffer = await downloadImage(imageUrl);

        // Decode image using TensorFlow
        const decodedImage = tfModule.node.decodeImage(imageBuffer, 3);

        // Analyze with NSFW model
        const predictions = await model.classify(decodedImage);

        // Clean up tensor
        decodedImage.dispose();

        // Convert predictions to object
        const result: Record<string, number> = {};
        predictions.forEach((pred: { className: string; probability: number }) => {
            result[pred.className] = pred.probability;
        });

        return result;

    } catch (error) {
        logger.error({ err: error as Error, msg: '[ERROR] NSFW detection error' });
        return null;
    }
}

/**
 * Checks if an image is NSFW based on predictions
 * @param predictions - Prediction results
 * @param threshold - NSFW threshold
 * @returns Whether image is NSFW
 */
export function isImageNsfw(predictions: Record<string, number> | null, threshold = 0.6): boolean {
    if (!predictions) {return false;}

    // Categories considered NSFW
    const nsfwCategories = ['Porn', 'Sexy', 'Hentai'];

    for (const category of nsfwCategories) {
        if (predictions[category] && predictions[category] >= threshold) {
            return true;
        }
    }

    return false;
}

interface MessageLike {
    channel: { nsfw: boolean };
    attachments: {
        filter(fn: (att: any) => boolean): Map<string, { contentType: string | undefined; url: string; name: string }>;
        size: number;
    };
}

/**
 * Checks message attachments for NSFW content
 * @param guildId - Guild ID
 * @param message - Discord message
 * @param enabledOverride - Override for the enabled flag
 * @returns Detection result or null
 */
export async function checkMessageAttachments(
    guildId: string,
    message: MessageLike,
    enabledOverride: boolean | null = null
): Promise<{
    detected: boolean;
    images: { url: string; name: string; predictions: Record<string, number> }[];
    shouldDelete: boolean;
    shouldWarn: boolean;
} | null> {
    const config = await getNsfwConfig(guildId);
    const enabled = enabledOverride ?? config.enabled;

    if (!enabled || !isNsfwDetectionAvailable()) {
        return null;
    }

    // Skip if channel is NSFW and exemption is enabled
    if (config.exemptNsfwChannels && message.channel.nsfw) {
        return null;
    }

    // Check if message has image attachments
    const imageAttachments = message.attachments.filter(att => {
        const contentType = att.contentType || '';
        return contentType.startsWith('image/');
    });

    if (imageAttachments.size === 0) {
        return null;
    }

    const nsfwImages: { url: string; name: string; predictions: Record<string, number> }[] = [];

    // Analyze each image
    for (const [, attachment] of imageAttachments) {
        try {
            const predictions = await analyzeImage(attachment.url);

            if (predictions && isImageNsfw(predictions, config.threshold)) {
                nsfwImages.push({
                    url: attachment.url ?? '',
                    name: attachment.name ?? 'unknown',
                    predictions
                });
            }
        } catch (error) {
            logger.error({ err: error as Error, msg: `[ERROR] Failed to analyze attachment ${attachment.name}` });
        }
    }

    if (nsfwImages.length > 0) {
        return {
            detected: true,
            images: nsfwImages,
            shouldDelete: config.deleteMessages,
            shouldWarn: config.warnOnDetection
        };
    }

    return null;
}

/**
 * Enqueues NSFW analysis job to worker queue
 * @param imageUrl - URL of the image to analyze
 * @param guildId - Guild ID
 * @param threshold - NSFW threshold
 * @returns Job info
 */
export async function enqueueNsfwAnalysis(imageUrl: string, guildId: string, threshold = 0.6): Promise<any> {
    const queue = await createQueue(JobNames.NSFW_ANALYZE);
    const job = await queue.add(JobNames.NSFW_ANALYZE, { imageUrl, guildId, threshold }, {
        attempts: 2,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400, count: 100 }
    });
    return job;
}

/**
 * Formats NSFW predictions for display
 * @param predictions - NSFW predictions
 * @returns Formatted string
 */
export function formatNsfwPredictions(predictions: Record<string, number>): string {
    return Object.entries(predictions)
        .map(([category, probability]) => {
            const percentage = Math.round(probability * 100);
            return `${category}: ${percentage}%`;
        })
        .sort((a, b) => {
            const aVal = parseInt(a.split(': ')[1]);
            const bVal = parseInt(b.split(': ')[1]);
            return bVal - aVal;
        })
        .join('\n');
}

// Model is loaded lazily on first use via initializeNsfwModel()