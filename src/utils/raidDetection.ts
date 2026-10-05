import {
    trackJoinRedis,
    checkRaidPatternRedis,
    isRaidModeEnabledRedis,
    setRaidModeRedis
} from './raidDetectionRedis.js';
import {
    checkRaidPattern,
    handleRaidDetected,
    enableRaidMode,
    disableRaidMode,
    isRaidModeEnabled,
    cleanupRaidState
} from './raidDetectionCore.js';

export {
    trackJoinRedis,
    checkRaidPatternRedis,
    isRaidModeEnabledRedis,
    setRaidModeRedis,
    type RaidRedis
} from './raidDetectionRedis.js';
export {
    checkRaidPattern,
    handleRaidDetected,
    enableRaidMode,
    disableRaidMode,
    isRaidModeEnabled,
    cleanupRaidState
} from './raidDetectionCore.js';
export type { RaidThresholds, RaidCheckResult } from './raidDetectionTypes.js';

export default {
    trackJoinRedis,
    checkRaidPatternRedis,
    isRaidModeEnabledRedis,
    setRaidModeRedis,
    checkRaidPattern,
    handleRaidDetected,
    enableRaidMode,
    disableRaidMode,
    isRaidModeEnabled,
    cleanupRaidState
};
