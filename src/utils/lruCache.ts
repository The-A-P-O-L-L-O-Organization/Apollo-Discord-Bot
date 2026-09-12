// O(1) LRU Cache Implementation
// Uses Map + Doubly Linked List for true O(1) get/put/evict operations

/**
 * Doubly linked list node for LRU tracking
 */
class LRUNode<K, V> {
    key: K;
    value: V;
    prev: LRUNode<K, V> | null;
    next: LRUNode<K, V> | null;
    accessTime: number;

    constructor(key: K, value: V) {
        this.key = key;
        this.value = value;
        this.prev = null;
        this.next = null;
        this.accessTime = Date.now();
    }
}

interface LRUCacheOptions<K, V> {
    maxSize?: number;
    onEvict?: ((key: K, value: V) => void) | null;
}

/**
 * O(1) LRU Cache with configurable max size
 * Supports both single-level and two-level (guild -> user) caching
 */
export class LRUCache<K, V> {
    maxSize: number;
    onEvict: ((key: K, value: V) => void) | null;
    cache: Map<K, LRUNode<K, V>>;
    head: LRUNode<K, V>;
    tail: LRUNode<K, V>;
    size: number;

    /**
     * @param options - Configuration options
     * @param options.maxSize - Maximum number of entries (default: 10000)
     * @param options.onEvict - Optional callback when entry is evicted (key, value)
     */
    constructor({ maxSize = 10000, onEvict = null }: LRUCacheOptions<K, V> = {}) {
        this.maxSize = maxSize;
        this.onEvict = onEvict;
        this.cache = new Map<K, LRUNode<K, V>>();
        this.head = new LRUNode(null as unknown as K, null as unknown as V); // Most recently used
        this.tail = new LRUNode(null as unknown as K, null as unknown as V); // Least recently used
        this.head.next = this.tail;
        this.tail.prev = this.head;
        this.size = 0;
    }

    /**
     * Adds node to head (most recently used)
     * @private
     */
    _addToHead(node: LRUNode<K, V>): void {
        node.prev = this.head;
        node.next = this.head.next;
        if (this.head.next) this.head.next.prev = node;
        this.head.next = node;
    }

    /**
     * Removes node from linked list
     * @private
     */
    _removeNode(node: LRUNode<K, V>): void {
        if (node.prev) node.prev.next = node.next;
        if (node.next) node.next.prev = node.prev;
    }

    /**
     * Moves node to head (most recently used)
     * @private
     */
    _moveToHead(node: LRUNode<K, V>): void {
        this._removeNode(node);
        this._addToHead(node);
    }

    /**
     * Removes and returns tail node (least recently used)
     * @private
     */
    _popTail(): LRUNode<K, V> | null {
        const tail = this.tail.prev;
        if (tail === this.head || tail === null) { return null; }
        this._removeNode(tail);
        return tail;
    }

    /**
     * Gets value by key, updates LRU order
     * @param key - Cache key
     * @returns Value or undefined if not found
     */
    get(key: K): V | undefined {
        const node = this.cache.get(key);
        if (!node) { return undefined; }
        
        node.accessTime = Date.now();
        this._moveToHead(node);
        return node.value;
    }

    /**
     * Sets key-value pair, updates LRU order
     * @param key - Cache key
     * @param value - Value to store
     * @returns True if new entry, false if updated existing
     */
    set(key: K, value: V): boolean {
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
    _evictLRU(): void {
        const tail = this._popTail();
        if (tail) {
            this.cache.delete(tail.key);
            this.size--;
            if (this.onEvict) {
                // eslint-disable-next-line no-empty
                try { this.onEvict(tail.key, tail.value); } catch {}
            }
        }
    }

    /**
     * Checks if key exists
     * @param key - Cache key
     * @returns boolean
     */
    has(key: K): boolean {
        return this.cache.has(key);
    }

    /**
     * Deletes key from cache
     * @param key - Cache key
     * @returns True if deleted
     */
    delete(key: K): boolean {
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
    clear(): void {
        this.cache.clear();
        this.head.next = this.tail;
        this.tail.prev = this.head;
        this.size = 0;
    }

    /**
     * Gets current size
     * @returns number
     */
    getSize(): number {
        return this.size;
    }

    /**
     * Gets all keys in LRU order (most recent first)
     * @returns Array of keys
     */
    keys(): K[] {
        const result: K[] = [];
        let current: LRUNode<K, V> | null = this.head.next;
        while (current !== this.tail && current !== null) {
            result.push(current.key);
            current = current.next;
        }
        return result;
    }

    /**
     * Gets all entries in LRU order (most recent first)
     * @returns Array of {key, value} objects
     */
    entries(): Array<{ key: K; value: V }> {
        const result: Array<{ key: K; value: V }> = [];
        let current: LRUNode<K, V> | null = this.head.next;
        while (current !== this.tail && current !== null) {
            result.push({ key: current.key, value: current.value });
            current = current.next;
        }
        return result;
    }
}

interface TwoLevelLRUCacheOptions {
    maxGuilds?: number;
    maxUsersPerGuild?: number;
    maxTotalUsers?: number;
    onEvict?: ((guildId: string, userId: string, value: unknown) => void) | null;
}

/**
 * Two-level LRU Cache for guild -> user tracking
 * Maintains per-guild LRU with global size limit
 */
export class TwoLevelLRUCache {
    maxGuilds: number;
    maxUsersPerGuild: number;
    maxTotalUsers: number;
    onEvict: ((guildId: string, userId: string, value: unknown) => void) | null;
    guildLRU: LRUCache<string, LRUCache<string, unknown>>;
    totalUsers: number;

    /**
     * @param options - Configuration options
     * @param options.maxGuilds - Maximum number of guilds (default: 1000)
     * @param options.maxUsersPerGuild - Maximum users per guild (default: 500)
     * @param options.maxTotalUsers - Maximum total users across all guilds (default: 50000)
     * @param options.onEvict - Optional callback (guildId, userId, value)
     */
    constructor({ 
        maxGuilds = 1000, 
        maxUsersPerGuild = 500, 
        maxTotalUsers = 50000,
        onEvict = null 
    }: TwoLevelLRUCacheOptions = {}) {
        this.maxGuilds = maxGuilds;
        this.maxUsersPerGuild = maxUsersPerGuild;
        this.maxTotalUsers = maxTotalUsers;
        this.onEvict = onEvict;
        
        // Guild-level LRU (tracks guild access order)
        this.guildLRU = new LRUCache<string, LRUCache<string, unknown>>({ 
            maxSize: maxGuilds,
            onEvict: (guildId: string, guildCache: LRUCache<string, unknown>) => {
                // Clean up guild cache when guild is evicted
                for (const [userId, value] of guildCache.entries()) {
                    if (this.onEvict) {
                        // eslint-disable-next-line no-empty
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
    _getGuildCache(guildId: string): LRUCache<string, unknown> {
        let guildCache = this.guildLRU.get(guildId);
        if (!guildCache) {
            guildCache = new LRUCache<string, unknown>({ 
                maxSize: this.maxUsersPerGuild,
                onEvict: (userId: string, value: unknown) => {
                    this.totalUsers--;
                    if (this.onEvict) {
                        // eslint-disable-next-line no-empty
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
     * @param guildId - Guild ID
     * @param userId - User ID
     * @returns Value or undefined
     */
    get(guildId: string, userId: string): unknown {
        const guildCache = this.guildLRU.get(guildId);
        if (!guildCache) { return undefined; }
        return guildCache.get(userId);
    }

    /**
     * Sets value for guild+user
     * @param guildId - Guild ID
     * @param userId - User ID
     * @param value - Value to store
     * @returns True if new entry
     */
    set(guildId: string, userId: string, value: unknown): boolean {
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
     * @param guildId - Guild ID
     * @param userId - User ID
     * @returns boolean
     */
    has(guildId: string, userId: string): boolean {
        const guildCache = this.guildLRU.get(guildId);
        if (!guildCache) { return false; }
        return guildCache.has(userId);
    }

    /**
     * Deletes guild+user entry
     * @param guildId - Guild ID
     * @param userId - User ID
     * @returns True if deleted
     */
    delete(guildId: string, userId: string): boolean {
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
     * @param guildId - Guild ID
     * @returns number
     */
    getGuildSize(guildId: string): number {
        const guildCache = this.guildLRU.get(guildId);
        return guildCache ? guildCache.getSize() : 0;
    }

    /**
     * Gets total users across all guilds
     * @returns number
     */
    getTotalUsers(): number {
        return this.totalUsers;
    }

    /**
     * Gets number of guilds
     * @returns number
     */
    getGuildCount(): number {
        return this.guildLRU.getSize();
    }

    /**
     * Enforces global user limit by evicting LRU entries across all guilds
     * @private
     */
    _enforceGlobalLimit(): void {
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
                    // eslint-disable-next-line no-empty
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
    cleanupEmptyGuilds(): void {
        for (const [guildId, node] of this.guildLRU.cache) {
            const guildCache = node.value;
            if (guildCache.getSize() === 0) {
                this.guildLRU.delete(guildId);
            }
        }
    }

    /**
     * Clears all entries
     */
    clear(): void {
        this.guildLRU.clear();
        this.totalUsers = 0;
    }
}

export default {
    LRUCache,
    TwoLevelLRUCache
};