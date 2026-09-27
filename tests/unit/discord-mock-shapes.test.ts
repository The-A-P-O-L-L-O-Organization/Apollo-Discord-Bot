// Discord.js v14 mock shapes tests
import { describe, it, expect, vi } from 'vitest'
import { 
    createMockInteraction, 
    createMockGuild, 
    createMockMember
} from '../../tests/mocks/discord.js'
import { EmbedBuilder } from 'discord.js'

describe('Discord.js v14 mock shapes', () => {
  it('createMockInteraction has correct permissions structure', () => {
    const interaction = createMockInteraction()
    expect(interaction.guild).toBeDefined()
    expect(interaction.guild!.permissions).toBeDefined()
    expect(typeof interaction.guild!.permissions.has).toBe('function')
  })

  it('createMockGuild has roles.cache Map', () => {
    const guild = createMockGuild()
    expect(guild.roles).toBeDefined()
    expect(guild.roles.cache).toBeInstanceOf(Map)
    expect(typeof guild.roles.cache.get).toBe('function')
    expect(typeof guild.roles.cache.has).toBe('function')
  })

  it('createMockMember has permissions bitfield', () => {
    const member = createMockMember()
    expect(member.permissions).toBeDefined()
    expect(typeof member.permissions.has).toBe('function')
    expect(typeof member.permissions.bitfield).toBe('bigint')
  })

  it('EmbedBuilder getters work', () => {
    const embed = new EmbedBuilder()
      .setTitle('Test')
      .setDescription('Description')
    expect(embed.title).toBe('Test')
    expect(embed.description).toBe('Description')
  })
})