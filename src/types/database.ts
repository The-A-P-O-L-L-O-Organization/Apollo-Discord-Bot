// Database types (Knex integration)

import type { Knex } from 'knex';
import type { Database as BetterSQLite3Database } from 'better-sqlite3';

export interface DatabaseConfig {
    type: 'sqlite' | 'postgres';
    connection: SQLiteConnection | PostgresConnection;
    pool?: PoolConfig;
    migrations: MigrationConfig;
    seeds?: SeedConfig;
}

export interface SQLiteConnection {
    filename: string;
    pragmas?: Record<string, string | number | boolean>;
}

export interface PostgresConnection {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean | { rejectUnauthorized: boolean };
    schema?: string;
}

export interface PoolConfig {
    min: number;
    max: number;
    acquireTimeoutMillis?: number;
    createTimeoutMillis?: number;
    destroyTimeoutMillis?: number;
    idleTimeoutMillis?: number;
    reapIntervalMillis?: number;
    createRetryIntervalMillis?: number;
}

// Re-export better-sqlite3 Database type
export type { Database as BetterSQLite3Database } from 'better-sqlite3';

export interface MigrationConfig {
    directory: string;
    tableName: string;
    extension: 'ts' | 'js';
    loadExtensions: string[];
}

export interface SeedConfig {
    directory: string;
    loadExtensions: string[];
}

// Repository pattern types
export interface Repository<T extends { id: string | number }> {
    findById: (id: string | number) => Promise<T | null>;
    findAll: (options?: FindOptions) => Promise<T[]>;
    findOne: (conditions: Partial<T>) => Promise<T | null>;
    create: (data: Omit<T, 'id'>) => Promise<T>;
    update: (id: string | number, data: Partial<T>) => Promise<T | null>;
    delete: (id: string | number) => Promise<boolean>;
    count: (conditions?: Partial<T>) => Promise<number>;
    exists: (conditions: Partial<T>) => Promise<boolean>;
}

export interface FindOptions {
    limit?: number;
    offset?: number;
    orderBy?: { column: string; direction: 'asc' | 'desc' }[];
    where?: Record<string, unknown>;
    whereRaw?: string;
    whereRawBindings?: unknown[];
}

// Guild data types
export interface GuildData {
    id: string;
    guildId: string;
    key: string;
    value: unknown;
    createdAt: Date;
    updatedAt: Date;
}

export interface UserData {
    id: string;
    userId: string;
    key: string;
    value: unknown;
    createdAt: Date;
    updatedAt: Date;
}

// Migration types
export interface MigrationRecord {
    id: number;
    name: string;
    batch: number;
    migrationTime: Date;
}

// Query builder extensions
export interface QueryBuilderExtensions {
    whereJsonContains: (column: string, value: Record<string, unknown>) => Knex.QueryBuilder;
    whereJsonPath: (column: string, path: string, value: unknown) => Knex.QueryBuilder;
    jsonExtract: (column: string, path: string) => Knex.QueryBuilder;
}

// Adapter types (from src/db/adapter.js)
export interface AdapterConfig {
    tableName: string;
    keyColumn: string;
    valueColumn: string;
    guildColumn?: string;
    userColumn?: string;
}

export interface GetDataOptions {
    guildId?: string;
    userId?: string;
    key: string;
    defaultValue?: unknown;
}

export interface SetDataOptions {
    guildId?: string;
    userId?: string;
    key: string;
    value: unknown;
}

export interface GetAllDataOptions {
    key: string;
    guildId?: string;
    userId?: string;
}

export interface DatabaseAdapter {
    getGuildData: <T>(options: GetDataOptions & { guildId: string }) => Promise<T | undefined>;
    setGuildData: <T>(options: SetDataOptions & { guildId: string }) => Promise<void>;
    getUserData: <T>(options: GetDataOptions & { userId: string }) => Promise<T | undefined>;
    setUserData: <T>(options: SetDataOptions & { userId: string }) => Promise<void>;
    getAllGuildData: <T>(key: string) => Promise<Map<string, T>>;
    getAllUserData: <T>(key: string) => Promise<Map<string, T>>;
    deleteGuildData: (guildId: string, key: string) => Promise<void>;
    deleteUserData: (userId: string, key: string) => Promise<void>;
}

// Transaction types
export type TransactionCallback<T> = (trx: Knex.Transaction) => Promise<T>;

export interface DatabaseTransaction {
    commit: () => Promise<void>;
    rollback: () => Promise<void>;
    isCompleted: () => boolean;
}

// Health check
export interface DatabaseHealth {
    healthy: boolean;
    connected: boolean;
    latency: number;
    poolSize?: number;
    poolIdle?: number;
    poolUsed?: number;
    migrationsPending: number;
    lastMigration?: string;
}