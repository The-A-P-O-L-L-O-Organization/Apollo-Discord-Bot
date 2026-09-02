import { logger } from '../utils/logger.js';
 
// NSFW Detection Utility
// Scans image attachments for NSFW content using TensorFlow.js
 
import { safeFetch } from './safeFetch.js';
import { getGuildData } from './db.js';
import { createQueue } from '../queue/queue.js';
import { JobNames } from '../queue/queue.js';

let model = null;
let modelLoaded = false;
let modelPromise = null;
let tfModule = null;

/**
 * Initializes the NSFW detection model
 * @returns {Promise<boolean>} Whether initialization was successful
 */
export async function initializeNsfwModel() {
    if (modelPromise) {return modelPromise;}
    modelPromise = (async() => {
        try {
            logger.info('[INFO] Loading NSFW detection model...');
            tfModule = await import('@tensorflow/tfjs-node');
            const nsfwjs = await import('nsfwjs');
            model = await nsfwjs.load();
            modelLoaded = true;
            logger.info('[INFO] NSFW detection model loaded successfully');
            return true;
        } catch (error) {
            logger.error('[ERROR] Failed to load NSFW detection model:', error);
            modelLoaded = false;
            modelPromise = null;
            return false;
        }
    })();
    return modelPromise;
}

/**
 * Checks if NSFW detection is available
 * @returns {boolean} Whether model is loaded
 */
export function isNsfwDetectionAvailable() {
    return modelLoaded && model !== null;
}

/**
 * Gets NSFW detection configuration for a guild
 * @param {string} guildId - The guild ID
 * @returns {Object} Configuration
 */
export async function getNsfwConfig(guildId) {
    const guildConfig = await getGuildData('nsfw-config', guildId);
    return {
        enabled: guildConfig.enabled ?? false,
        threshold: guildConfig.threshold ?? 0.6,
        deleteMessages: guildConfig.deleteMessages ?? true,
        warnOnDetection: guildConfig.warnOnDetection ?? false,
        exemptNsfwChannels: guildConfig.exemptNsfwChannels ?? true
    };
}

/**
 * Downloads an image from URL
 * @param {string} url - Image URL
 * @returns {Promise<Buffer>} Image buffer
 */
async function downloadImage(url) {
    const result = await safeFetch(url, {
        maxBytes: 10 * 1024 * 1024,
        timeoutMs: 10000,
        skipDnsCheck: true
    });
    return result.buffer;
}

/**
 * Analyzes an image for NSFW content
 * @param {string} imageUrl - URL of the image to analyze
 * @returns {Promise<Object|null>} Analysis result or null
 */
export async function analyzeImage(imageUrl) {
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
        const result = {};
        predictions.forEach(pred => {
            result[pred.className] = pred.probability;
        });
        
        return result;
        
    } catch (error) {
        logger.error('[ERROR] NSFW detection error:', error.message);
        return null;
    }
}

/**
 * Checks if an image is NSFW based on predictions
 * @param {Object} predictions - Prediction results
 * @param {number} threshold - NSFW threshold
 * @returns {boolean} Whether image is NSFW
 */
export function isImageNsfw(predictions, threshold = 0.6) {
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

/**
 * Checks message attachments for NSFW content
 * @param {string} guildId - Guild ID
 * @param {Message} message - Discord message
 * @param {boolean|null} enabledOverride - Override for the enabled flag
 * @returns {Promise<Object|null>} Detection result or null
 */
export async function checkMessageAttachments(guildId, message, enabledOverride = null) {
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
    
    const nsfwImages = [];
    
    // Analyze each image
    for (const [, attachment] of imageAttachments) {
        try {
            const predictions = await analyzeImage(attachment.url);
            
            if (predictions && isImageNsfw(predictions, config.threshold)) {
                nsfwImages.push({
                    url: attachment.url,
                    name: attachment.name,
                    predictions
                });
            }
        } catch (error) {
            logger.error(`[ERROR] Failed to analyze attachment ${attachment.name}:`, error.message);
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
 * @param {string} imageUrl - URL of the image to analyze
 * @param {string} guildId - Guild ID
 * @param {number} threshold - NSFW threshold
 * @returns {Promise<Object>} Job info
 */
export async function enqueueNsfwAnalysis(imageUrl, guildId, threshold = 0.6) {
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
 * @param {Object} predictions - NSFW predictions
 * @returns {string} Formatted string
 */
export function formatNsfwPredictions(predictions) {
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
