/* eslint-disable no-console */
import { createServiceBreaker } from './circuitBreaker.js';

const MODERATION_URL = 'https://api.openai.com/v1/moderations';

// Create circuit breaker for OpenAI
const openaiBreaker = createServiceBreaker('openai');

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

export async function checkModeration(content) {
    if (!apiKey) {return null;}
    if (!content || content.length < 3) {return null;}

    try {
        const result = await openaiBreaker.execute(async() => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 30000);
            let response;
            try {
                response = await fetch(MODERATION_URL, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ input: content }),
                    signal: controller.signal
                });
            } finally {
                clearTimeout(timer);
            }

            if (!response.ok) {
                if (response.status === 429) {
                    console.log('[WARN] OpenAI Moderation rate limited');
                }
                // Throw error to trigger circuit breaker
                const error = new Error(`OpenAI API error: ${response.status}`);
                error.status = response.status;
                throw error;
            }

            const data = await response.json();
            return data.results[0];
        });
        
        return result;
    } catch (error) {
        if (error.name === 'CircuitBreakerOpenError') {
            console.log('[CIRCUIT] OpenAI circuit breaker open, skipping moderation check');
            return null;
        }
        console.error('[ERROR] OpenAI Moderation failed:', error.message);
        return null;
    }
}

export async function checkMessageModeration(content) {
    const result = await checkModeration(content);
    if (!result || !result.flagged) {return null;}

    const violations = Object.entries(result.categories)
        .filter(([, flagged]) => flagged)
        .map(([category]) => ({
            category,
            score: result.category_scores[category]
        }));

    if (violations.length === 0) {return null;}

    return { flagged: true, violations };
}

export function formatViolations(violations) {
    return violations.map(v => {
        const label = v.category.replace(/\//g, ' / ').replace(/_/g, ' ');
        const pct = Math.round(v.score * 100);
        return `${label}: ${pct}%`;
    }).join('\n');
}

initializeModeration();
