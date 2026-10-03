import { readFileSync } from 'node:fs';
import { config } from '../../config/config.js';

export interface TlsCertificates {
    cert: string;
    key: string;
    ca?: string;
}

export interface TlsConfig {
    cert: string;
    key: string;
    ca?: string;
    requestCert: boolean;
    rejectUnauthorized: boolean;
}

export function loadCertificates(): TlsCertificates | null {
    const certPath = config.interlink.tlsCert;
    const keyPath = config.interlink.tlsKey;
    const caPath = config.interlink.caCert;

    if (!certPath || !keyPath) {
        return null;
    }

    try {
        const cert = readFileSync(certPath, 'utf8');
        const key = readFileSync(keyPath, 'utf8');

        const certs: TlsCertificates = { cert, key };

        if (caPath) {
            certs.ca = readFileSync(caPath, 'utf8');
        }

        return certs;
    } catch (err) {
        throw new Error(`Failed to load TLS certificates: ${(err as Error).message}`);
    }
}

export function createTlsConfig(certs: TlsCertificates | null): TlsConfig | undefined {
    if (!certs) {
        return undefined;
    }

    return {
        cert: certs.cert,
        key: certs.key,
        ca: certs.ca,
        requestCert: true,
        rejectUnauthorized: true
    };
}