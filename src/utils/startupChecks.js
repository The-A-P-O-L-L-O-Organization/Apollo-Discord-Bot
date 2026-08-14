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

export function assertOperatorAgreement(operator) {
    if (!operator || typeof operator !== 'object') {
        throw new Error(
            '[FATAL] Operator configuration is missing. ' +
            'Set OPERATOR_AGREEMENT and OPERATOR_CONTACT in your .env file.'
        );
    }

    if (operator.agreed !== true) {
        throw new Error(
            '[FATAL] OPERATOR_AGREEMENT is not set to true. ' +
            'You must read legal/TOS.md and legal/PRIVACY.md, then set ' +
            'OPERATOR_AGREEMENT=true in your .env file to acknowledge the ' +
            'operator responsibilities before the bot will start.'
        );
    }

    if (!operator.contact || typeof operator.contact !== 'string' || operator.contact.trim().length === 0) {
        throw new Error(
            '[FATAL] OPERATOR_CONTACT is empty. ' +
            'You must publish a contact channel (Discord user tag, email, ' +
            'support server invite, etc.) so users of your instance can ' +
            'reach you with privacy requests, deletion requests, and ' +
            'reports of bot misbehavior. Set OPERATOR_CONTACT in your .env file.'
        );
    }
}
