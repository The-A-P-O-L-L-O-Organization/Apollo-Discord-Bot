// Feature Flag Utilities
// Provides utilities for gradual feature rollout and canary deployments

import { config } from '../config/config.js';

/**
 * Feature flag configuration for NSFW Rust worker rollout
 */
export interface NsfwFeatureFlags {
    useRust: boolean;
    rolloutPercentage: number;
    grpcAddr: string;
    threshold: number;
    rustTimeoutMs: number;
}

/**
 * Parses rollout percentage from environment or config
 * @returns Rollout percentage (0-100)
 */
function getRolloutPercentage(): number {
    const envRollout = process.env['NSFW_ROLLOUT_PERCENTAGE'];
    if (envRollout !== undefined) {
        const parsed = parseInt(envRollout, 10);
        if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 100) {
            return parsed;
        }
    }
    return 0;
}

/**
 * Determines if a request should use the Rust NSFW worker based on rollout percentage
 * Uses consistent hashing on guildId + userId for stable assignment
 * @param guildId - Guild ID
 * @param userId - User ID (optional)
 * @returns true if request should use Rust worker
 */
export function shouldUseRustWorker(guildId: string, userId?: string): boolean {
    const flags = getNsfwFeatureFlags();

    if (!flags.useRust) {
        return false;
    }

    if (flags.rolloutPercentage >= 100) {
        return true;
    }

    if (flags.rolloutPercentage <= 0) {
        return false;
    }

    // Consistent hashing for stable assignment
    const hashInput = `${guildId}:${userId ?? 'anonymous'}`;
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
        hash = ((hash << 5) - hash) + hashInput.charCodeAt(i);
        hash |= 0; // Convert to 32-bit integer
    }
    const bucket = Math.abs(hash) % 100;

    return bucket < flags.rolloutPercentage;
}

/**
 * Gets the current NSFW feature flag configuration
 * @returns Current feature flag state
 */
export function getNsfwFeatureFlags(): NsfwFeatureFlags {
    return {
        useRust: config.nsfw.useRust,
        rolloutPercentage: getRolloutPercentage(),
        grpcAddr: config.nsfw.grpcAddr,
        threshold: config.nsfw.threshold,
        rustTimeoutMs: config.nsfw.rustTimeoutMs
    };
}

/**
 * Checks if the Rust NSFW worker is enabled (regardless of rollout)
 * @returns true if Rust worker is enabled
 */
export function isRustWorkerEnabled(): boolean {
    return config.nsfw.useRust === true;
}

/**
 * Gets the effective NSFW threshold (from config or default)
 * @returns Threshold value (0.0-1.0)
 */
export function getNsfwThreshold(): number {
    return config.nsfw.threshold;
}

/**
 * Gets the Rust worker gRPC address
 * @returns gRPC address string
 */
export function getNsfwGrpcAddress(): string {
    return config.nsfw.grpcAddr;
}

/**
 * Gets the Rust worker timeout in milliseconds
 * @returns Timeout in milliseconds
 */
export function getNsfwRustTimeoutMs(): number {
    return config.nsfw.rustTimeoutMs;
}

/**
 * Feature flag names for reference
 */
export const FeatureFlags = {
    NSFW_USE_RUST: 'NSFW_USE_RUST',
    NSFW_ROLLOUT_PERCENTAGE: 'NSFW_ROLLOUT_PERCENTAGE',
    NSFW_GRPC_ADDR: 'NSFW_GRPC_ADDR',
    NSFW_THRESHOLD: 'NSFW_THRESHOLD',
    NSFW_RUST_TIMEOUT_MS: 'NSFW_RUST_TIMEOUT_MS'
} as const;