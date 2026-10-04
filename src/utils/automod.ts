export { getAutomodConfig, type AutomodConfig, type ChannelOverride } from './automodConfig.js';
export {
    isExempt,
    isChannelExempt,
    normalizeContent,
    checkBannedWords,
    checkInvites,
    checkLinks,
    checkMentionSpam,
    checkCapsSpam,
    checkAccountAge,
    checkPhishingLinks,
    type PhishingMatch
} from './automodChecking.js';
export {
    checkBurstSpam,
    cleanupBurstTracker,
    trackMessageRedis,
    checkSpamRedis,
    checkSpam,
    cleanupSpamTracker,
    stopSpamTrackerCleanup
} from './automodSpam.js';
