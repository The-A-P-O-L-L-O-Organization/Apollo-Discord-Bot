// NSFW Detection Utility - gRPC client wrapper
// Replaces TensorFlow.js implementation with Rust gRPC worker
import { logger } from '../utils/logger.js';
import type { Attachment, Collection } from 'discord.js';
import { safeFetch } from './safeFetch.js';
import { getGuildData } from './db.js';
import { createQueue, JobNames } from '../queue/queue.js';
import type { NSFWAnalyzeJobData } from '../types/queue.js';
import { config } from '../config/config.js';
import { analyzeImageGrpc, isRustWorkerAvailable, getCircuitBreakerStatus, resetCircuitBreaker } from '../queue/nsfwClient.js';

interface NsfwConfig {
    enabled: boolean;
    threshold: number;
    deleteMessages: boolean;
    warnOnDetection: boolean;
    exemptNsfwChannels: boolean;
}

const CLASS_LABELS = ['Drawing', 'Hentai', 'Neutral', 'Porn', 'Sexy'];
const NSFW_CATEGORIES = ['Porn', 'Sexy', 'Hentai'];

/**
 * Gets NSFW detection configuration for a guild
 * @param guildId - The guild ID
 * @returns Configuration
 */
export async function getNsfwConfig(guildId: string): Promise<NsfwConfig> {
    const guildConfig = await getGuildData('nsfw-config', guildId) as Partial<NsfwConfig> | null;
    return {
        enabled: guildConfig?.enabled ?? false,
        threshold: guildConfig?.threshold ?? config.nsfw.threshold,
        deleteMessages: guildConfig?.deleteMessages ?? true,
        warnOnDetection: guildConfig?.warnOnDetection ?? false,
        exemptNsfwChannels: guildConfig?.exemptNsfwChannels ?? true
    };
}

/**
 * Checks if NSFW detection is available (Rust worker ready)
 * @returns Whether Rust worker is available
 */
export async function isNsfwDetectionAvailable(): Promise<boolean> {
    return isRustWorkerAvailable();
}

/**
 * Downloads an image from URL
 * @param url - Image URL
 * @returns Image buffer
 */
async function _downloadImage(url: string): Promise<Buffer> {
    const result = await safeFetch(url, {
        maxBytes: 10 * 1024 * 1024,
        timeoutMs: 10000,
        skipDnsCheck: true
    });
    return result.buffer;
}

/**
 * Analyzes an image for NSFW content using Rust gRPC worker
 * @param imageUrl - URL of the image to analyze
 * @returns Analysis result or null
 */
export async function analyzeImage(imageUrl: string, guildId = 'unknown', userId = 'unknown'): Promise<Record<string, number> | null> {
    try {
        const result = await analyzeImageGrpc(imageUrl, config.nsfw.threshold, guildId, userId);
        if (!result?.predictions) {
            return null;
        }

        // Convert predictions to the expected format
        const predictions: Record<string, number> = {};
        for (const label of CLASS_LABELS) {
            predictions[label] = result.predictions[label] ?? 0;
        }

        return predictions;
    } catch (error) {
        const cbStatus = getCircuitBreakerStatus();
        if (cbStatus.isOpen) {
            logger.warn({ msg: '[NSFW] Circuit breaker open, failing open', ...cbStatus });
        }
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

    for (const category of NSFW_CATEGORIES) {
        if (predictions[category] && predictions[category] >= threshold) {
            return true;
        }
    }

    return false;
}

interface MessageLike {
    channel: { id: string; nsfw?: boolean };
    attachments: Collection<string, Attachment>;
}

/**
 * Checks message attachments for NSFW content using Rust gRPC worker
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
    const guildConfig = await getNsfwConfig(guildId);
    const enabled = enabledOverride ?? guildConfig.enabled;

    if (!enabled || !(await isRustWorkerAvailable())) {
        return null;
    }

    // Skip if channel is NSFW and exemption is enabled
    if (guildConfig.exemptNsfwChannels && message.channel.nsfw) {
        return null;
    }

    // Check if message has image attachments
    const imageAttachments = message.attachments.filter(att => {
        const contentType = att.contentType ?? '';
        return contentType.startsWith('image/');
    });

    if (imageAttachments.size === 0) {
        return null;
    }

    const nsfwImages: { url: string; name: string; predictions: Record<string, number> }[] = [];

    // Analyze each image using gRPC
    for (const [, attachment] of imageAttachments) {
        try {
            const predictions = await analyzeImage(attachment.url);

            if (predictions && isImageNsfw(predictions, guildConfig.threshold)) {
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
            shouldDelete: guildConfig.deleteMessages,
            shouldWarn: guildConfig.warnOnDetection
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
export async function enqueueNsfwAnalysis(imageUrl: string, guildId: string, threshold = 0.6): Promise<NSFWAnalyzeJobData> {
    const queue = await createQueue(JobNames.NSFW_ANALYZE);
    await queue.add(JobNames.NSFW_ANALYZE, { imageUrl, guildId, threshold }, {
        attempts: 2,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 86400, count: 100 }
    });
    return { imageUrl, guildId, threshold };
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
            const aVal = parseInt(a.split(': ')[1] ?? '');
            const bVal = parseInt(b.split(': ')[1] ?? '');
            return bVal - aVal;
        })
        .join('\n');
}

/**
 * Resets the circuit breaker for the Rust worker
 */
export function resetNsfwCircuitBreaker(): void {
    resetCircuitBreaker();
}

/**
 * Gets the circuit breaker status for monitoring
 */
export function getNsfwCircuitBreakerStatus(): { isOpen: boolean; failureCount: number; lastFailure: number | null } {
    const status = getCircuitBreakerStatus();
    return {
        isOpen: status.isOpen,
        failureCount: status.failures,
        lastFailure: status.lastFailure || null
    };
}