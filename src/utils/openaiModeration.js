/* eslint-disable no-console */
import { getGuildData } from './db.js';

const MODERATION_URL = 'https://api.openai.com/v1/moderations';

let apiKey = null;

export function initializeModeration() {
    apiKey = process.env.OPENAI_API_KEY || null;
    if (!apiKey) {
        console.log('[INFO] OPENAI_API_KEY not set - AI moderation disabled');
    }
    return !!apiKey;
}

export function isModerationAvailable() {
    return !!apiKey;
}

export async function getModerationConfig(guildId) {
    const guildConfig = await getGuildData('moderation-config', guildId) || {};
    return {
        enabled: guildConfig.enabled ?? false,
        autoDelete: guildConfig.autoDelete ?? true,
        autoWarn: guildConfig.autoWarn ?? false
    };
}

export async function checkModeration(content) {
    if (!apiKey) {return null;}
    if (!content || content.length < 3) {return null;}

    try {
        const response = await fetch(MODERATION_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ input: content })
        });

        if (!response.ok) {
            if (response.status === 429) {
                console.log('[WARN] OpenAI Moderation rate limited');
            }
            return null;
        }

        const data = await response.json();
        return data.results[0];
    } catch (error) {
        console.error('[ERROR] OpenAI Moderation failed:', error.message);
        return null;
    }
}

export async function checkMessageModeration(guildId, content) {
    const config = await getModerationConfig(guildId);
    if (!config.enabled || !apiKey) {return null;}

    const result = await checkModeration(content);
    if (!result || !result.flagged) {return null;}

    const violations = Object.entries(result.categories)
        .filter(([, flagged]) => flagged)
        .map(([category]) => ({
            category,
            score: result.category_scores[category]
        }));

    if (violations.length === 0) {return null;}

    return {
        flagged: true,
        violations,
        shouldDelete: config.autoDelete,
        shouldWarn: config.autoWarn
    };
}

export function formatViolations(violations) {
    return violations.map(v => {
        const label = v.category.replace(/\//g, ' / ').replace(/_/g, ' ');
        const pct = Math.round(v.score * 100);
        return `${label}: ${pct}%`;
    }).join('\n');
}

initializeModeration();
