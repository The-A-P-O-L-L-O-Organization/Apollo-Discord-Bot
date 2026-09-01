/**
 * SimHash 128-bit implementation using 3-gram shingles
 * For spam detection: similar messages have similar hashes
 */

// Simple hash function for strings (DJB2 variant)
function stringHash(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i); // hash * 33 + c
    }
    return hash >>> 0; // Ensure unsigned 32-bit
}

/**
 * Normalize text for SimHash: lowercase, strip punctuation/URLs, split into 3-grams
 * @param {string} text - Input text
 * @returns {string[]} Array of 3-gram shingles
 */
function normalizeAndShingle(text) {
    // Convert to lowercase
    let normalized = text.toLowerCase();
    
    // Remove URLs (simple regex)
    normalized = normalized.replace(/https?:\/\/\S+/g, '');
    
    // Remove punctuation and special characters (keep letters, numbers, spaces)
    normalized = normalized.replace(/[^a-z0-9\s]/g, '');
    
    // Collapse multiple spaces
    normalized = normalized.replace(/\s+/g, ' ').trim();
    
    // If too short, return empty array
    if (normalized.length < 3) {
        return [];
    }
    
    // Generate 3-grams (shingles)
    const shingles = [];
    for (let i = 0; i <= normalized.length - 3; i++) {
        shingles.push(normalized.substring(i, i + 3));
    }
    
    return shingles;
}

/**
 * Compute 128-bit SimHash of text
 * @param {string} text - Input text
 * @returns {bigint} 128-bit fingerprint
 */
export function simhash(text) {
    const shingles = normalizeAndShingle(text);
    if (shingles.length === 0) {
        return BigInt(0);
    }
    
    // Initialize 128-bit vector (we'll use two 64-bit numbers combined)
    const v1 = Array(64).fill(0); // First 64 bits
    const v2 = Array(64).fill(0); // Second 64 bits
    
    // For each shingle
    for (const shingle of shingles) {
        // Hash the shingle to get a 128-bit value
        // Use four 32-bit hashes combined for 128-bit
        const h1 = stringHash(shingle);
        const h2 = stringHash(shingle + '2');
        const h3 = stringHash(shingle + '3');
        const h4 = stringHash(shingle + '4');
        
        // Process each bit position (0-127)
        for (let i = 0; i < 128; i++) {
            if (i < 32) {
                if ((h1 >> i) & 1) {
                    v1[i] += 1;
                } else {
                    v1[i] -= 1;
                }
            } else if (i < 64) {
                if ((h2 >> (i - 32)) & 1) {
                    v1[i] += 1;
                } else {
                    v1[i] -= 1;
                }
            } else if (i < 96) {
                if ((h3 >> (i - 64)) & 1) {
                    v2[i - 64] += 1;
                } else {
                    v2[i - 64] -= 1;
                }
            } else {
                if ((h4 >> (i - 96)) & 1) {
                    v2[i - 64] += 1;
                } else {
                    v2[i - 64] -= 1;
                }
            }
        }
    }
    
    // Convert vectors to two 64-bit bigints
    let result1 = BigInt(0);
    let result2 = BigInt(0);
    
    for (let i = 0; i < 64; i++) {
        if (v1[i] > 0) {
            result1 |= BigInt(1) << BigInt(i);
        }
        if (v2[i] > 0) {
            result2 |= BigInt(1) << BigInt(i);
        }
    }
    
    // Combine: result2 is higher 64 bits, result1 is lower 64 bits
    return (result2 << BigInt(64)) | result1;
}

/**
 * Calculate Hamming distance between two 128-bit hashes
 * @param {bigint} a - First hash
 * @param {bigint} b - Second hash
 * @returns {number} Number of differing bits
 */
export function hammingDistance(a, b) {
    const xor = a ^ b;
    // Count bits in xor
    let count = 0;
    let val = xor;
    while (val) {
        count += Number(val & BigInt(1));
        val >>= BigInt(1);
    }
    return count;
}

/**
 * Check if two hashes are similar based on Hamming distance threshold
 * @param {bigint} a - First hash
 * @param {bigint} b - Second hash
 * @param {number} threshold - Maximum distance to be similar (default: 8)
 * @returns {boolean} True if distance < threshold
 */
export function isSimilar(a, b, threshold = 8) {
    return hammingDistance(a, b) < threshold;
}