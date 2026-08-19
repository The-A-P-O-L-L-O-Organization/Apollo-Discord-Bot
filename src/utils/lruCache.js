 
// O(1) LRU Cache Implementation
// Uses Map + Doubly Linked List for true O(1) get/put/evict operations

/**
 * Doubly linked list node for LRU tracking
 */
class LRUNode {
    constructor(key, value) {
        this.key = key;
        this.value = value;
        this.prev = null;
        this.next = null;
        this.accessTime = Date.now();
    }
}

/**
 * O(1) LRU Cache with configurable max size
 * Supports both single-level and two-level (guild -> user) caching
 */
export class LRUCache {
    /**
     * @param {Object} options
     * @param {number} options.maxSize - Maximum number of entries
     * @param {Function} options.onEvict - Optional callback when entry is evicted (key, value)
     */
    constructor({ maxSize = 10000, onEvict = null } = {}) {
        this.maxSize = maxSize;
        this.onEvict = onEvict;
        this.cache = new Map(); // key -> LRUNode
        this.head = new LRUNode(null, null); // Most recently used
        this.tail = new LRUNode(null, null); // Least recently used
        this.head.next = this.tail;
        this.tail.prev = this.head;
        this.size = 0;
    }

    /**
     * Adds node to head (most recently used)
     * @private
     */
    _addToHead(node) {
        node.prev = this.head;
        node.next = this.head.next;
        this.head.next.prev = node;
        this.head.next = node;
    }

    /**
     * Removes node from linked list
     * @private
     */
    _removeNode(node) {
        node.prev.next = node.next;
        node.next.prev = node.prev;
    }

    /**
     * Moves node to head (most recently used)
     * @private
     */
    _moveToHead(node) {
        this._removeNode(node);
        this._addToHead(node);
    }

    /**
     * Removes and returns tail node (least recently used)
     * @private
     */
    _popTail() {
        const tail = this.tail.prev;
        if (tail === this.head) { return null; }
        this._removeNode(tail);
        return tail;
    }

    /**
     * Gets value by key, updates LRU order
     * @param {*} key - Cache key
     * @returns {*} Value or undefined if not found
     */
    get(key) {
        const node = this.cache.get(key);
        if (!node) { return undefined; }
        
        node.accessTime = Date.now();
        this._moveToHead(node);
        return node.value;
    }

    /**
     * Sets key-value pair, updates LRU order
     * @param {*} key - Cache key
     * @param {*} value - Value to store
     * @returns {boolean} True if new entry, false if updated existing
     */
    set(key, value) {
        const existing = this.cache.get(key);
        if (existing) {
            existing.value = value;
            existing.accessTime = Date.now();
            this._moveToHead(existing);
            return false;
        }
        
        // Check if we need to evict
        if (this.size >= this.maxSize) {
            this._evictLRU();
        }
        
        const node = new LRUNode(key, value);
        this.cache.set(key, node);
        this._addToHead(node);
        this.size++;
        return true;
    }

    /**
     * Evicts least recently used entry
     * @private
     */
    _evictLRU() {
        const tail = this._popTail();
        if (tail) {
            this.cache.delete(tail.key);
            this.size--;
            if (this.onEvict) {
                try { this.onEvict(tail.key, tail.value); } catch {}
            }
        }
    }

    /**
     * Checks if key exists
     * @param {*} key - Cache key
     * @returns {boolean}
     */
    has(key) {
        return this.cache.has(key);
    }

    /**
     * Deletes key from cache
     * @param {*} key - Cache key
     * @returns {boolean} True if deleted
     */
    delete(key) {
        const node = this.cache.get(key);
        if (!node) { return false; }
        
        this._removeNode(node);
        this.cache.delete(key);
        this.size--;
        return true;
    }

    /**
     * Clears all entries
     */
    clear() {
        this.cache.clear();
        this.head.next = this.tail;
        this.tail.prev = this.head;
        this.size = 0;
    }

    /**
     * Gets current size
     * @returns {number}
     */
    getSize() {
        return this.size;
    }

    /**
     * Gets all keys in LRU order (most recent first)
     * @returns {Array}
     */
    keys() {
        const result = [];
        let current = this.head.next;
        while (current !== this.tail) {
            result.push(current.key);
            current = current.next;
        }
        return result;
    }

    /**
     * Gets all entries in LRU order (most recent first)
     * @returns {Array<{key, value}>}
     */
    entries() {
        const result = [];
        let current = this.head.next;
        while (current !== this.tail) {
            result.push({ key: current.key, value: current.value });
            current = current.next;
        }
        return result;
    }
}

/**
 * Two-level LRU Cache for guild -> user tracking
 * Maintains per-guild LRU with global size limit
 */
export class TwoLevelLRUCache {
    /**
     * @param {Object} options
     * @param {number} options.maxGuilds - Maximum number of guilds
     * @param {number} options.maxUsersPerGuild - Maximum users per guild
     * @param {number} options.maxTotalUsers - Maximum total users across all guilds
     * @param {Function} options.onEvict - Optional callback (guildId, userId, value)
     */
    constructor({ 
        maxGuilds = 1000, 
        maxUsersPerGuild = 500, 
        maxTotalUsers = 50000,
        onEvict = null 
    } = {}) {
        this.maxGuilds = maxGuilds;
        this.maxUsersPerGuild = maxUsersPerGuild;
        this.maxTotalUsers = maxTotalUsers;
        this.onEvict = onEvict;
        
        // Guild-level LRU (tracks guild access order)
        this.guildLRU = new LRUCache({ 
            maxSize: maxGuilds,
            onEvict: (guildId, guildCache) => {
                // Clean up guild cache when guild is evicted
                for (const [userId, value] of guildCache.entries()) {
                    if (this.onEvict) {
                        try { this.onEvict(guildId, userId, value); } catch {}
                    }
                }
            }
        });
        
        // Global user count
        this.totalUsers = 0;
    }

    /**
     * Gets or creates guild cache
     * @private
     */
    _getGuildCache(guildId) {
        let guildCache = this.guildLRU.get(guildId);
        if (!guildCache) {
            guildCache = new LRUCache({ 
                maxSize: this.maxUsersPerGuild,
                onEvict: (userId, value) => {
                    this.totalUsers--;
                    if (this.onEvict) {
                        try { this.onEvict(guildId, userId, value); } catch {}
                    }
                }
            });
            this.guildLRU.set(guildId, guildCache);
        }
        return guildCache;
    }

    /**
     * Gets value for guild+user
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @returns {*} Value or undefined
     */
    get(guildId, userId) {
        const guildCache = this.guildLRU.get(guildId);
        if (!guildCache) { return undefined; }
        return guildCache.get(userId);
    }

    /**
     * Sets value for guild+user
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @param {*} value - Value to store
     * @returns {boolean} True if new entry
     */
    set(guildId, userId, value) {
        const guildCache = this._getGuildCache(guildId);
        const isNew = guildCache.set(userId, value);
        
        if (isNew) {
            this.totalUsers++;
            this._enforceGlobalLimit();
        }
        
        return isNew;
    }

    /**
     * Checks if guild+user exists
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @returns {boolean}
     */
    has(guildId, userId) {
        const guildCache = this.guildLRU.get(guildId);
        if (!guildCache) { return false; }
        return guildCache.has(userId);
    }

    /**
     * Deletes guild+user entry
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @returns {boolean} True if deleted
     */
    delete(guildId, userId) {
        const guildCache = this.guildLRU.get(guildId);
        if (!guildCache) { return false; }
        
        const deleted = guildCache.delete(userId);
        if (deleted) {
            this.totalUsers--;
            
            // Clean up empty guild cache
            if (guildCache.getSize() === 0) {
                this.guildLRU.delete(guildId);
            }
        }
        return deleted;
    }

    /**
     * Gets guild cache size
     * @param {string} guildId - Guild ID
     * @returns {number}
     */
    getGuildSize(guildId) {
        const guildCache = this.guildLRU.get(guildId);
        return guildCache ? guildCache.getSize() : 0;
    }

    /**
     * Gets total users across all guilds
     * @returns {number}
     */
    getTotalUsers() {
        return this.totalUsers;
    }

    /**
     * Gets number of guilds
     * @returns {number}
     */
    getGuildCount() {
        return this.guildLRU.getSize();
    }

    /**
     * Enforces global user limit by evicting LRU entries across all guilds
     * @private
     */
    _enforceGlobalLimit() {
        if (this.totalUsers <= this.maxTotalUsers) { return; }
        
        // Evict 10% of excess
        const toEvict = Math.ceil((this.totalUsers - this.maxTotalUsers) * 1.1);
        
        // Evict from guilds with most users first
        const guildsBySize = this.guildLRU.entries()
            .map(({ key: guildId, value: guildCache }) => ({ 
                guildId, 
                size: guildCache.getSize() 
            }))
            .sort((a, b) => b.size - a.size);
        
        let evicted = 0;
        for (const { guildId } of guildsBySize) {
            if (evicted >= toEvict) { break; }
            const guildCache = this.guildLRU.get(guildId);
            if (!guildCache) { continue; }
            
            // Evict LRU from this guild
            const tail = guildCache._popTail();
            if (tail) {
                guildCache.cache.delete(tail.key);
                guildCache.size--;
                this.totalUsers--;
                evicted++;
                if (this.onEvict) {
                    try { this.onEvict(guildId, tail.key, tail.value); } catch {}
                }
            }
            
            // Clean up empty guild
            if (guildCache.getSize() === 0) {
                this.guildLRU.delete(guildId);
            }
        }
    }

    /**
     * Cleans up empty guilds
     */
    cleanupEmptyGuilds() {
        for (const [guildId, guildCache] of this.guildLRU.cache) {
            if (guildCache.getSize() === 0) {
                this.guildLRU.delete(guildId);
            }
        }
    }

    /**
     * Clears all entries
     */
    clear() {
        this.guildLRU.clear();
        this.totalUsers = 0;
    }
}

export default {
    LRUCache,
    TwoLevelLRUCache
};