import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/utils/db.js', () => ({
  getData: vi.fn().mockResolvedValue({ nextId: 1, subscriptions: [] }),
  setData: vi.fn(),
}));

describe('integrationWebhook', () => {
  describe('verifyGithubSignature', () => {
    it('returns false when secret is empty', async () => {
      const { verifyGithubSignature } = await import('../../src/utils/integrationWebhook.js');
      const result = verifyGithubSignature('{}', 'sha256=abc', '');
      expect(result).toBe(false);
    });

    it('returns true for a valid signature', async () => {
      const { verifyGithubSignature } = await import('../../src/utils/integrationWebhook.js');
      const body = JSON.stringify({ test: true });
      const secret = 'mysecret';
      const { createHmac } = await import('crypto');
      const sig = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
      const result = verifyGithubSignature(body, sig, secret);
      expect(result).toBe(true);
    });

    it('returns false for an invalid signature', async () => {
      const { verifyGithubSignature } = await import('../../src/utils/integrationWebhook.js');
      const result = verifyGithubSignature('{}', 'sha256=invalid', 'mysecret');
      expect(result).toBe(false);
    });
  });

  describe('handleGithubEvent', () => {
    it('returns null for ping event', async () => {
      const { handleGithubEvent } = await import('../../src/utils/integrationWebhook.js');
      const result = await handleGithubEvent('ping', {});
      expect(result).toBeNull();
    });

    it('returns formatted notification for push event', async () => {
      const { handleGithubEvent } = await import('../../src/utils/integrationWebhook.js');
      const payload = {
        repository: { full_name: 'owner/repo' },
        sender: { login: 'user' },
        ref: 'refs/heads/main',
        commits: [{ message: 'Fix bug', id: 'abc123', url: 'https://github.com/owner/repo/commit/abc123' }],
      };
      const result = await handleGithubEvent('push', payload);
      expect(result).not.toBeNull();
      expect(result.embeds[0].title).toContain('owner/repo');
    });

    it('returns formatted notification for pull_request event', async () => {
      const { handleGithubEvent } = await import('../../src/utils/integrationWebhook.js');
      const payload = {
        repository: { full_name: 'owner/repo' },
        sender: { login: 'user' },
        pull_request: { number: 1, title: 'My PR', body: 'Desc', html_url: 'https://github.com/owner/repo/pull/1', state: 'open' },
      };
      const result = await handleGithubEvent('pull_request', payload);
      expect(result).not.toBeNull();
      expect(result.embeds[0].title).toContain('#1');
    });

    it('returns formatted notification for issues event', async () => {
      const { handleGithubEvent } = await import('../../src/utils/integrationWebhook.js');
      const payload = {
        repository: { full_name: 'owner/repo' },
        sender: { login: 'user' },
        issue: { number: 42, title: 'Bug report', body: 'Desc', html_url: 'https://github.com/owner/repo/issue/42', state: 'open' },
      };
      const result = await handleGithubEvent('issues', payload);
      expect(result).not.toBeNull();
      expect(result.embeds[0].title).toContain('#42');
    });
  });
});
