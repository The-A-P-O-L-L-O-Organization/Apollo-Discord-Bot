export const interlinkConfig = {
    enabled: process.env.INTERLINK_ENABLED === 'true',
    httpPort: parseInt(process.env.INTERLINK_HTTP_PORT || '3456', 10),
    redis: {
        host: process.env.INTERLINK_REDIS_HOST || process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.INTERLINK_REDIS_PORT || process.env.REDIS_PORT || '6379', 10),
        password: process.env.INTERLINK_REDIS_PASSWORD || process.env.REDIS_PASSWORD || undefined,
        channelPrefix: process.env.INTERLINK_REDIS_PREFIX || 'apollo:interlink'
    },
    forwardEvents: (process.env.INTERLINK_FORWARD_EVENTS || 'memberJoin,guildBanAdd').split(',').filter(Boolean),
    requestTimeout: parseInt(process.env.INTERLINK_REQUEST_TIMEOUT || '5000', 10),
    maxRetries: parseInt(process.env.INTERLINK_MAX_RETRIES || '3', 10)
};
