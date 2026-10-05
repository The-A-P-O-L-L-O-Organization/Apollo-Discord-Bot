import { DEFAULT_RAID_THRESHOLDS } from './raidDetectionTypes.js';

/**
 * Counts similar names in a list of usernames
 * @param usernames - Array of usernames
 * @returns Count of similar names
 */
export function countSimilarNames(usernames: string[]): number {
    if (usernames.length < 2) {return 0;}

    let similarCount = 0;

    for (let i = 0; i < usernames.length - 1; i++) {
        for (let j = i + 1; j < usernames.length; j++) {
            const similarity = calculateSimilarity(usernames[i]!, usernames[j]!);
            if (similarity >= DEFAULT_RAID_THRESHOLDS.similarNameThreshold) {
                similarCount++;
            }
        }
    }

    return similarCount;
}

/**
 * Calculates string similarity using Levenshtein distance
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Similarity ratio (0-1)
 */
export function calculateSimilarity(str1: string, str2: string): number {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) {return 1.0;}

    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
}

/**
 * Calculates Levenshtein distance between two strings
 * @param str1 - First string
 * @param str2 - Second string
 * @returns Edit distance
 */
export function levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
        matrix[0]![j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i]![j] = matrix[i - 1]?.[j - 1] ?? 0;
            } else {
                matrix[i]![j] = Math.min(
                    (matrix[i - 1]?.[j - 1] ?? 0) + 1,
                    (matrix[i]?.[j - 1] ?? 0) + 1,
                    (matrix[i - 1]?.[j] ?? 0) + 1
                );
            }
        }
    }

    return matrix[str2.length]?.[str1.length] ?? 0;
}
