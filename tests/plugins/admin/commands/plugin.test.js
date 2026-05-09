import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Plugin management command', () => {
  let pluginCommand;

  beforeAll(async () => {
    pluginCommand = (await import('../../../../src/plugins/admin/commands/plugin.js')).default;
  });

  it('should have correct name', () => {
    expect(pluginCommand.name).toBe('plugin');
  });

  it('should have subcommands', () => {
    const subcommands = pluginCommand.options.filter(o => o.type === 1);
    expect(subcommands.length).toBeGreaterThanOrEqual(8);
    const names = subcommands.map(s => s.name);
    expect(names).toContain('list');
    expect(names).toContain('enable');
    expect(names).toContain('disable');
    expect(names).toContain('reload');
    expect(names).toContain('load');
    expect(names).toContain('install');
    expect(names).toContain('uninstall');
    expect(names).toContain('search');
    expect(names).toContain('update');
  });

  it('should restrict to bot owners', async () => {
    process.env.OWNER_IDS = 'owner123';
    const interaction = {
      user: { id: 'notowner' },
      reply: vi.fn(),
      options: { getSubcommand: () => 'list' }
    };
    await pluginCommand.execute(interaction);
    expect(interaction.reply).toHaveBeenCalled();
    const call = interaction.reply.mock.calls[0][0];
    expect(call.ephemeral).toBe(true);
    delete process.env.OWNER_IDS;
  });
});
