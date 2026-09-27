import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { config } from '../../config/config.js';

const ISSUER = 'apollo-interlink';
const ALGORITHM = 'HS256';

export interface InterlinkTokenPayload extends JWTPayload {
    botId: string;
    capabilities: Record<string, string>;
    iss: typeof ISSUER;
}

function getSecret(): Uint8Array {
    const secret = config.interlink.jwtSecret;
    if (!secret) {
        throw new Error('INTERLINK_JWT_SECRET not configured');
    }
    if (secret.length < 32) {
        throw new Error('INTERLINK_JWT_SECRET must be at least 32 characters');
    }
    return new TextEncoder().encode(secret);
}

function getExpiry(): string {
    return config.interlink.jwtExpiry ?? '1h';
}

export async function issueInterlinkToken(
    botId: string,
    capabilities: Record<string, string>
): Promise<string> {
    const secret = getSecret();
    const expiry = getExpiry();
    
    return new SignJWT({ 
        botId, 
        capabilities,
        iss: ISSUER
    } as InterlinkTokenPayload)
        .setProtectedHeader({ alg: ALGORITHM, typ: 'JWT' })
        .setIssuedAt()
        .setExpirationTime(expiry)
        .sign(secret);
}

export async function verifyInterlinkToken(token: string): Promise<InterlinkTokenPayload> {
    const secret = getSecret();
    
    const { payload } = await jwtVerify<InterlinkTokenPayload>(token, secret, {
        issuer: ISSUER,
        algorithms: [ALGORITHM],
        clockTolerance: 30 // 30 seconds clock skew tolerance
    });
    
    // Verify required claims
    if (!payload.botId || typeof payload.botId !== 'string') {
        throw new Error('Token missing required claim: botId');
    }
    if (!payload.capabilities || typeof payload.capabilities !== 'object') {
        throw new Error('Token missing required claim: capabilities');
    }
    if (payload.iss !== ISSUER) {
        throw new Error('Token has invalid issuer');
    }
    
    return payload;
}