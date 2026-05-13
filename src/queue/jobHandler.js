const handlers = new Map();

export function registerHandler(jobName, fn) {
    if (handlers.has(jobName)) {
        throw new Error(`Handler for "${jobName}" is already registered`);
    }
    handlers.set(jobName, fn);
}

export function getHandler(jobName) {
    return handlers.get(jobName) || null;
}

export async function handleJob(job) {
    const fn = handlers.get(job.name);
    if (!fn) {throw new Error(`No handler registered for job: "${job.name}"`);}
    return fn(job);
}

export function clearHandlers() {
    handlers.clear();
}
