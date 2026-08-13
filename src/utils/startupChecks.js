// Startup validation helpers
// Fail fast with a clear message instead of a confusing Discord login error.

const TOKEN_PLACEHOLDERS = new Set(['your-token-here', 'your-discord-bot-token-here']);

export function assertDiscordToken(token) {
    if (!token || TOKEN_PLACEHOLDERS.has(token)) {
        throw new Error(
            '[FATAL] DISCORD_TOKEN is missing or unset. ' +
            'Set a real bot token in your .env file (see .env.example) before starting.'
        );
    }
}
