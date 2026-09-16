import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest';

describe('Plugin management command', () => {
  let pluginCommand;
  let accessControl;

  beforeAll(async () => {
    pluginCommand = (await import('../../../../src/plugins/admin/commands/plugin.js')).default;
    accessControl = await import('../../../../src/utils/accessControl.js');
  });

  beforeEach(() => {
    accessControl.clearOwnerIdsCache();
    delete process.env.OWNER_IDS;
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
      editReply: vi.fn(),
      deferReply: vi.fn(),
      options: { getSubcommand: () => 'list' }
    };
    await pluginCommand.execute(interaction);
    expect(interaction.deferReply).toHaveBeenCalled();
    expect(interaction.editReply).toHaveBeenCalled();
  });

  describe('plugin install confirmation', () => {
    function makeInteraction(confirmValue) {
      const installPlugin = vi.fn().mockResolvedValue({});
      return {
        user: { id: 'owner' },
        client: { manager: { installPlugin } },
        deferReply: vi.fn().mockResolvedValue({}),
        editReply: vi.fn().mockResolvedValue({}),
        options: {
          getSubcommand: vi.fn().mockReturnValue('install'),
          getString: vi.fn().mockReturnValue('some-plugin'),
          getBoolean: vi.fn().mockReturnValue(confirmValue)
        }
      };
    }

    it('should refuse install without explicit confirmation', async () => {
      process.env.OWNER_IDS = 'owner';
      const interaction = makeInteraction(false);
      await pluginCommand.execute(interaction);
      expect(interaction.client.manager.installPlugin).not.toHaveBeenCalled();
      const reply = interaction.editReply.mock.calls[0][0];
      expect(reply.embeds[0].title).toContain('Confirm');
    });

    it('should install with confirmation', async () => {
      process.env.OWNER_IDS = 'owner';
      const interaction = makeInteraction(true);
      await pluginCommand.execute(interaction);
      expect(interaction.client.manager.installPlugin).toHaveBeenCalledWith('some-plugin');
    });
  });

  it('should deny when OWNER_IDS is unset', async () => {
    delete process.env.OWNER_IDS;
    const installPlugin = vi.fn().mockResolvedValue({});
    const interaction = {
      user: { id: 'randomuser' },
      client: { manager: { installPlugin } },
      deferReply: vi.fn().mockResolvedValue({}),
      editReply: vi.fn().mockResolvedValue({}),
      options: {
        getSubcommand: vi.fn().mockReturnValue('install'),
        getString: vi.fn().mockReturnValue('some-plugin'),
        getBoolean: vi.fn().mockReturnValue(true)
      }
    };
    await pluginCommand.execute(interaction);
    expect(installPlugin).not.toHaveBeenCalled();
    const reply = interaction.editReply.mock.calls[0][0];
    expect(reply.embeds[0].title).toContain('Access Denied');
  });
});
