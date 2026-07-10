/* eslint-disable no-console */
// Perspective API Utility
// AI-powered toxicity detection using Google's Perspective API

import { getGuildData } from './db.js';

let perspectiveClient = null;
let apiAvailable = false;

/**
 * Initializes the Perspective API client
 * @returns {boolean} Whether initialization was successful
 */
export function initializePerspectiveApi() {
    const apiKey = process.env.PERSPECTIVE_API_KEY;
    
    if (!apiKey) {
        console.log('[INFO] Perspective API key not found - toxicity detection disabled');
        return false;
    }
    
    try {
        // Dynamically import the Perspective API client
        import('@conversationai/perspectiveapi-js-client').then(module => {
            const Perspective = module.default;
            perspectiveClient = new Perspective({ apiKey });
            apiAvailable = true;
            console.log('[INFO] Perspective API initialized successfully');
        }).catch(error => {
            console.error('[ERROR] Failed to initialize Perspective API:', error);
            apiAvailable = false;
        });
        
        return true;
    } catch (error) {
        console.error('[ERROR] Failed to initialize Perspective API:', error);
        return false;
    }
}

/**
 * Checks if Perspective API is available
 * @returns {boolean} Whether API is available
 */
export function isPerspectiveApiAvailable() {
    return apiAvailable && perspectiveClient !== null;
}

/**
 * Gets Perspective API configuration for a guild
 * @param {string} guildId - The guild ID
 * @returns {Object} Configuration
 */
export async function getPerspectiveConfig(guildId) {
    const guildConfig = await getGuildData('perspective-config', guildId);
    return {
        enabled: guildConfig.enabled ?? false,
        toxicityThreshold: guildConfig.toxicityThreshold ?? 0.7,
        severeToxicityThreshold: guildConfig.severeToxicityThreshold ?? 0.85,
        deleteMessages: guildConfig.deleteMessages ?? true,
        warnOnDetection: guildConfig.warnOnDetection ?? false
    };
}

/**
 * Analyzes message toxicity using Perspective API
 * @param {string} content - Message content to analyze
 * @returns {Promise<Object|null>} Analysis result or null if unavailable/error
 */
export async function analyzeToxicity(content) {
    if (!isPerspectiveApiAvailable()) {
        return null;
    }
    
    // Skip very short messages
    if (!content || content.length < 3) {
        return null;
    }
    
    // Skip messages with only URLs or mentions
    const cleanContent = content.replace(/<@!?\d+>/g, '').replace(/https?:\/\/[^\s]+/g, '').trim();
    if (cleanContent.length < 3) {
        return null;
    }
    
    try {
        const result = await perspectiveClient.analyze({
            comment: { text: content },
            requestedAttributes: {
                TOXICITY: {},
                SEVERE_TOXICITY: {},
                IDENTITY_ATTACK: {},
                INSULT: {},
                PROFANITY: {},
                THREAT: {}
            },
            languages: ['en']
        });
        
        const scores = {
            toxicity: result.attributeScores.TOXICITY.summaryScore.value,
            severeToxicity: result.attributeScores.SEVERE_TOXICITY.summaryScore.value,
            identityAttack: result.attributeScores.IDENTITY_ATTACK.summaryScore.value,
            insult: result.attributeScores.INSULT.summaryScore.value,
            profanity: result.attributeScores.PROFANITY.summaryScore.value,
            threat: result.attributeScores.THREAT.summaryScore.value
        };
        
        return scores;
        
    } catch (error) {
        // Handle API errors gracefully
        if (error.response?.status === 429) {
            console.log('[WARN] Perspective API rate limit reached');
        } else if (error.response?.status === 400) {
            // Invalid text (too long, non-English, etc.)
            return null;
        } else {
            console.error('[ERROR] Perspective API error:', error.message);
        }
        return null;
    }
}

/**
 * Checks if message is toxic based on guild configuration
 * @param {string} guildId - Guild ID
 * @param {string} content - Message content
 * @returns {Promise<Object|null>} Detection result or null
 */
export async function checkMessageToxicity(guildId, content) {
    const config = await getPerspectiveConfig(guildId);
    
    if (!config.enabled || !isPerspectiveApiAvailable()) {
        return null;
    }
    
    const scores = await analyzeToxicity(content);
    
    if (!scores) {
        return null;
    }
    
    // Check if any score exceeds thresholds
    const violations = [];
    
    if (scores.severeToxicity >= config.severeToxicityThreshold) {
        violations.push({
            type: 'Severe Toxicity',
            score: scores.severeToxicity,
            threshold: config.severeToxicityThreshold
        });
    } else if (scores.toxicity >= config.toxicityThreshold) {
        violations.push({
            type: 'Toxicity',
            score: scores.toxicity,
            threshold: config.toxicityThreshold
        });
    }
    
    if (scores.threat >= 0.7) {
        violations.push({
            type: 'Threat',
            score: scores.threat,
            threshold: 0.7
        });
    }
    
    if (scores.identityAttack >= 0.7) {
        violations.push({
            type: 'Identity Attack',
            score: scores.identityAttack,
            threshold: 0.7
        });
    }
    
    if (violations.length > 0) {
        return {
            detected: true,
            violations,
            allScores: scores,
            shouldDelete: config.deleteMessages,
            shouldWarn: config.warnOnDetection
        };
    }
    
    return null;
}

/**
 * Formats toxicity scores for display
 * @param {Object} scores - Toxicity scores
 * @returns {string} Formatted string
 */
export function formatToxicityScores(scores) {
    return Object.entries(scores)
        .map(([key, value]) => {
            const label = key.replace(/([A-Z])/g, ' $1').trim();
            const percentage = Math.round(value * 100);
            return `${label}: ${percentage}%`;
        })
        .join('\n');
}

// Initialize on module load
initializePerspectiveApi();
