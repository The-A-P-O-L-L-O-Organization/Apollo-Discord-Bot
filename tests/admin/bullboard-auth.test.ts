import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Bull Board authentication', () => {
    afterEach(() => {
        delete process.env['ADMIN_AUTH_TOKENS'];
        delete process.env['OWNER_IDS'];
        vi.resetModules();
    });

    async function loadApp() {
        process.env['ADMIN_AUTH_TOKENS'] = 'owner=owner-secret,member=member-secret';
        process.env['OWNER_IDS'] = 'owner';
        const { clearOwnerIdsCache } = await import('../../src/utils/accessControl.js');
        clearOwnerIdsCache();
        return (await import('../../src/admin/bullboard.js')).bullBoardApp;
    }

    it('does not authenticate a spoofed identity header', async() => {
        const app = await loadApp();

        const response = await app.request('/admin/queues', {
            headers: { 'X-User-ID': 'owner' }
        });

        expect(response.status).toBe(401);
    });

    it('rejects invalid credentials', async() => {
        const app = await loadApp();

        const response = await app.request('/admin/queues', {
            headers: { Authorization: 'Bearer invalid' }
        });

        expect(response.status).toBe(401);
    });

    it('rejects authenticated non-owners', async() => {
        const app = await loadApp();

        const response = await app.request('/admin/queues', {
            headers: { Authorization: 'Bearer member-secret' }
        });

        expect(response.status).toBe(403);
    });

    it('allows configured owners to reach the Bull Board route', async() => {
        const app = await loadApp();

        const response = await app.request('/admin/queues', {
            headers: { Authorization: 'Bearer owner-secret' }
        });

        expect([200, 301, 302, 404]).toContain(response.status);
    });
});
