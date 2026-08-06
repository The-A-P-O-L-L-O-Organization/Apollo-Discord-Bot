// Startup validation helpers
// Fail fast with a clear message instead of a confusing Discord login error.

const TOKEN_PLACEHOLDER = 'your-token-here';

export function assertDiscordToken(token) {
    if (!token || token === TOKEN_PLACEHOLDER) {
        throw new Error(
            '[FATAL] DISCORD_TOKEN is missing or unset. ' +
            'Set a real bot token in your .env file (see .env.example) before starting.'
        );
    }
}
