// Result Type Utility
// Simple Result<T, E> type for explicit error handling without exceptions
// Inspired by Rust's Result and TypeScript best practices

/**
 * Result type representing either success (Ok) or failure (Err)
 * @template T - Success value type
 * @template E - Error type
 */
export type Result<T, E = Error> =
    | { readonly ok: true; readonly value: T }
    | { readonly ok: false; readonly error: E };

/**
 * Creates a successful Result
 * @param {T} value - Success value
 * @returns {Result<T, E>} Ok result
 */
export function ok<T, E = Error>(value: T): Result<T, E> {
    return { ok: true, value } as const;
}

/**
 * Creates a failed Result
 * @param {E} error - Error value
 * @returns {Result<T, E>} Err result
 */
export function err<T, E = Error>(error: E): Result<T, E> {
    return { ok: false, error } as const;
}

/**
 * Checks if a Result is Ok
 * @param {Result<T, E>} result - Result to check
 * @returns {result is { ok: true; value: T }} True if Ok
 */
export function isOk<T, E>(result: Result<T, E>): result is { readonly ok: true; readonly value: T } {
    return result.ok === true;
}

/**
 * Checks if a Result is Err
 * @param {Result<T, E>} result - Result to check
 * @returns {result is { ok: false; error: E }} True if Err
 */
export function isErr<T, E>(result: Result<T, E>): result is { readonly ok: false; readonly error: E } {
    return result.ok === false;
}

/**
 * Maps the success value of a Result
 * @param {Result<T, E>} result - Result to map
 * @param {Function} fn - Mapping function
 * @returns {Result<U, E>} New Result with mapped value
 */
export function map<T, U, E>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
    if (result.ok) {
        return ok(fn(result.value));
    }
    return result;
}

/**
 * Maps the error value of a Result
 * @param {Result<T, E>} result - Result to map
 * @param {Function} fn - Mapping function
 * @returns {Result<T, F>} New Result with mapped error
 */
export function mapErr<T, E, F>(result: Result<T, E>, fn: (error: E) => F): Result<T, F> {
    if (!result.ok) {
        return err(fn(result.error));
    }
    return result as Result<T, F>;
}

/**
 * Chains a function that returns a Result (flatMap)
 * @param {Result<T, E>} result - Result to chain
 * @param {Function} fn - Function returning Result
 * @returns {Result<U, E>} Chained Result
 */
export function andThen<T, U, E>(result: Result<T, E>, fn: (value: T) => Result<U, E>): Result<U, E> {
    if (result.ok) {
        return fn(result.value);
    }
    return result;
}

/**
 * Unwraps a Result, throwing if Err (use sparingly)
 * @param {Result<T, E>} result - Result to unwrap
 * @returns {T} Success value
 * @throws {E} If Err
 */
export function unwrap<T, E>(result: Result<T, E>): T {
    if (result.ok) {
        return result.value;
    }
    throw result.error;
}

/**
 * Unwraps a Result or returns a default value
 * @param {Result<T, E>} result - Result to unwrap
 * @param {T} defaultValue - Default value if Err
 * @returns {T} Success value or default
 */
export function unwrapOr<T, E>(result: Result<T, E>, defaultValue: T): T {
    return result.ok ? result.value : defaultValue;
}

/**
 * Executes a function and catches any thrown errors, returning a Result
 * @param {Function} fn - Function to execute
 * @returns {Promise<Result<T, Error>>} Result of execution
 */
export async function tryCatch<T, E = Error>(fn: () => Promise<T>): Promise<Result<T, E>> {
    try {
        const value = await fn();
        return ok(value);
    } catch (error) {
        return err(error as E);
    }
}

/**
 * Executes a synchronous function and catches any thrown errors, returning a Result
 * @param {Function} fn - Function to execute
 * @returns {Result<T, Error>} Result of execution
 */
export function tryCatchSync<T, E = Error>(fn: () => T): Result<T, E> {
    try {
        const value = fn();
        return ok(value);
    } catch (error) {
        return err(error as E);
    }
}

export default {
    ok,
    err,
    isOk,
    isErr,
    map,
    mapErr,
    andThen,
    unwrap,
    unwrapOr,
    tryCatch,
    tryCatchSync
};