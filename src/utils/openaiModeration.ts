import { logger } from '../utils/logger.js';
import { createServiceBreaker, CircuitBreakerOpenError } from './circuitBreaker.js';

const MODERATION_URL = 'https://api.openai.com/v1/moderations';

// Create circuit breaker for OpenAI
const openaiBreaker = createServiceBreaker('openai');

let apiKey: string | null = null;

export function initializeModeration(): boolean {
    apiKey = process.env['OPENAI_API_KEY'] ?? null;
    if (!apiKey) {
        logger.info({ msg: '[INFO] OPENAI_API_KEY not set - AI moderation disabled' });
    }
    return !!apiKey;
}

export function isModerationAvailable(): boolean {
    return !!apiKey;
}

interface ModerationResult {
    flagged: boolean;
    categories: Record<string, boolean>;
    category_scores: Record<string, number>;
}

interface ModerationViolation {
    category: string;
    score: number;
}

export async function checkModeration(content: string): Promise<ModerationResult | null> {
    if (!apiKey) {return null;}
    if (!content || content.length < 3) {return null;}

    try {
        const result = await openaiBreaker.execute(async () => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 30000);
            let response: Response;
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
                    logger.info({ msg: '[WARN] OpenAI Moderation rate limited' });
                }
                // Throw error to trigger circuit breaker
                const error = new Error(`OpenAI API error: ${response.status}`) as Error & { status: number };
                error.status = response.status;
                throw error;
            }

            const data = await response.json() as { results: ModerationResult[] };
            return data.results[0] ?? null;
        });
        
        return result ?? null;
    } catch (error) {
        if (error instanceof CircuitBreakerOpenError) {
            logger.info({ msg: '[CIRCUIT] OpenAI circuit breaker open, skipping moderation check' });
            return null;
        }
        logger.error({ err: error as Error, msg: '[ERROR] OpenAI Moderation failed' });
        return null;
    }
}

export async function checkMessageModeration(content: string): Promise<{ flagged: true; violations: ModerationViolation[] } | null> {
    const result = await checkModeration(content);
    if (!result || !result.flagged) {return null;}

    const violations = Object.entries(result.categories)
        .filter(([, flagged]) => flagged)
        .map(([category]) => ({
            category,
            score: result.category_scores[category] ?? 0
        }));

    if (violations.length === 0) {return null;}

    return { flagged: true, violations };
}

export function formatViolations(violations: ModerationViolation[]): string {
    return violations.map(v => {
        const label = v.category.replace(/\//g, ' / ').replace(/_/g, ' ');
        const pct = Math.round(v.score * 100);
        return `${label}: ${pct}%`;
    }).join('\n');
}

initializeModeration();