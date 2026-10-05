export const DEFAULT_RAID_THRESHOLDS = {
    joinCount: 5,           // Number of joins
    timeWindow: 10000,      // Within 10 seconds
    newAccountAge: 7,       // Days (accounts newer than this are suspicious)
    similarNameThreshold: 0.7, // Name similarity ratio
    alertCooldown: 60000    // 1 minute between alerts
};

export interface RaidThresholds {
    joinCount: number;
    timeWindow: number;
    newAccountAge: number;
    similarNameThreshold: number;
    alertCooldown: number;
}

export interface RaidCheckResult {
    detected: boolean;
    recentJoins: number;
    newAccounts: number;
    similarNames: number;
}

export interface RaidState {
    joins: {userId: string; username: string; timestamp: number; accountAge: number}[];
    raidMode: boolean;
    lastAlert: number;
}
