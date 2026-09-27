import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SignedCapabilities {
    pluginId: string;
    capabilities: string[];
    issuedAt: number;
    signature: string;
}

const EXPIRY_MS = 24 * 60 * 60 * 1000;
const SIGNATURE_PREFIX = 'hmac-sha256:';

function computeSignature(pluginId: string, capabilities: string[], issuedAt: number, secret: string): string {
    const payload = `${pluginId}:${JSON.stringify(capabilities)}:${issuedAt}`;
    const hmac = createHmac('sha256', secret);
    hmac.update(payload);
    return `${SIGNATURE_PREFIX}${hmac.digest('hex')}`;
}

export function signCapabilities(pluginId: string, capabilities: string[], secret: string): SignedCapabilities {
    const issuedAt = Date.now();
    const signature = computeSignature(pluginId, capabilities, issuedAt, secret);
    return {
        pluginId,
        capabilities,
        issuedAt,
        signature
    };
}

export { computeSignature };

export function verifyCapabilities(signed: SignedCapabilities, secret: string): { pluginId: string; capabilities: string[] } {
    if (
        !signed ||
        typeof signed.pluginId !== 'string' ||
        !Array.isArray(signed.capabilities) ||
        typeof signed.issuedAt !== 'number' ||
        typeof signed.signature !== 'string'
    ) {
        throw new Error('Invalid signed capabilities object');
    }

    if (!signed.signature.startsWith(SIGNATURE_PREFIX)) {
        throw new Error('Invalid capability signature');
    }

    const now = Date.now();
    if (now - signed.issuedAt > EXPIRY_MS) {
        throw new Error('Capability signature expired');
    }

    const expectedSignature = computeSignature(signed.pluginId, signed.capabilities, signed.issuedAt, secret);

    const expectedBuffer = Buffer.from(expectedSignature);
    const actualBuffer = Buffer.from(signed.signature);

    if (expectedBuffer.length !== actualBuffer.length || !timingSafeEqual(expectedBuffer, actualBuffer)) {
        throw new Error('Invalid capability signature');
    }

    return {
        pluginId: signed.pluginId,
        capabilities: signed.capabilities
    };
}