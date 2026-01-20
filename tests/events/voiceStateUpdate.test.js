// Voice State Update Event Tests
// Tests for the voiceStateUpdate event handler

import { describe, it, expect, vi, beforeEach } from 'vitest';
import voiceStateUpdateHandler from '../../src/events/voiceStateUpdate.js';
import { 
    createMockMember, 
    createMockUser, 
    createMockGuild,
    createMockChannel,
    createMockVoiceState,
    createMockClient
} from '../mocks/discord.js';

// Mock the logger module
vi.mock('../../src/utils/logger.js', () => ({
    logEvent: vi.fn().mockResolvedValue(undefined),
    createVoiceChangeEmbed: vi.fn().mockReturnValue({ toJSON: () => ({}) })
}));

import { logEvent, createVoiceChangeEmbed } from '../../src/utils/logger.js';

describe('VoiceStateUpdate Event', () => {
    let mockMember;
    let mockGuild;
    let mockClient;
    let voiceChannel1;
    let voiceChannel2;

    beforeEach(() => {
        vi.clearAllMocks();
        
        voiceChannel1 = createMockChannel({
            id: '111222333',
            name: 'Voice Channel 1',
            type: 2 // GUILD_VOICE
        });
        
        voiceChannel2 = createMockChannel({
            id: '444555666',
            name: 'Voice Channel 2',
            type: 2 // GUILD_VOICE
        });
        
        mockGuild = createMockGuild({
            id: '987654321',
            name: 'Test Server'
        });
        
        mockMember = createMockMember({
            id: '123456789',
            user: createMockUser({ 
                id: '123456789',
                tag: 'TestUser#0001',
                bot: false 
            }),
            guild: mockGuild
        });
        
        mockClient = createMockClient();
    });

    describe('Voice Channel Join', () => {
        it('should log event when user joins a voice channel', async () => {
            const oldState = createMockVoiceState({
                member: mockMember,
                channel: null,
                guild: mockGuild
            });
            
            const newState = createMockVoiceState({
                member: mockMember,
                channel: voiceChannel1,
                guild: mockGuild
            });
            
            createVoiceChangeEmbed.mockReturnValue({ type: 'join' });
            
            await voiceStateUpdateHandler.execute(oldState, newState, mockClient);
            
            expect(createVoiceChangeEmbed).toHaveBeenCalledWith(oldState, newState);
            expect(logEvent).toHaveBeenCalledWith(mockGuild, 'voiceChanges', { type: 'join' });
        });
    });

    describe('Voice Channel Leave', () => {
        it('should log event when user leaves a voice channel', async () => {
            const oldState = createMockVoiceState({
                member: mockMember,
                channel: voiceChannel1,
                guild: mockGuild
            });
            
            const newState = createMockVoiceState({
                member: mockMember,
                channel: null,
                guild: mockGuild
            });
            
            createVoiceChangeEmbed.mockReturnValue({ type: 'leave' });
            
            await voiceStateUpdateHandler.execute(oldState, newState, mockClient);
            
            expect(createVoiceChangeEmbed).toHaveBeenCalledWith(oldState, newState);
            expect(logEvent).toHaveBeenCalledWith(mockGuild, 'voiceChanges', { type: 'leave' });
        });
    });

    describe('Voice Channel Move', () => {
        it('should log event when user moves between voice channels', async () => {
            const oldState = createMockVoiceState({
                member: mockMember,
                channel: voiceChannel1,
                guild: mockGuild
            });
            
            const newState = createMockVoiceState({
                member: mockMember,
                channel: voiceChannel2,
                guild: mockGuild
            });
            
            createVoiceChangeEmbed.mockReturnValue({ type: 'move' });
            
            await voiceStateUpdateHandler.execute(oldState, newState, mockClient);
            
            expect(createVoiceChangeEmbed).toHaveBeenCalledWith(oldState, newState);
            expect(logEvent).toHaveBeenCalledWith(mockGuild, 'voiceChanges', { type: 'move' });
        });
    });

    describe('Bot User Handling', () => {
        it('should not log events for bot users', async () => {
            const botMember = createMockMember({
                id: 'BOT_ID',
                user: createMockUser({ 
                    id: 'BOT_ID',
                    tag: 'Bot#0001',
                    bot: true 
                }),
                guild: mockGuild
            });
            
            const oldState = createMockVoiceState({
                member: botMember,
                channel: null,
                guild: mockGuild
            });
            
            const newState = createMockVoiceState({
                member: botMember,
                channel: voiceChannel1,
                guild: mockGuild
            });
            
            await voiceStateUpdateHandler.execute(oldState, newState, mockClient);
            
            expect(createVoiceChangeEmbed).not.toHaveBeenCalled();
            expect(logEvent).not.toHaveBeenCalled();
        });
    });

    describe('Insignificant Changes', () => {
        it('should not log when createVoiceChangeEmbed returns null', async () => {
            const oldState = createMockVoiceState({
                member: mockMember,
                channel: voiceChannel1,
                guild: mockGuild
            });
            
            const newState = createMockVoiceState({
                member: mockMember,
                channel: voiceChannel1,
                guild: mockGuild
            });
            
            // Simulate insignificant change (e.g., mute/unmute) returning null
            createVoiceChangeEmbed.mockReturnValue(null);
            
            await voiceStateUpdateHandler.execute(oldState, newState, mockClient);
            
            expect(createVoiceChangeEmbed).toHaveBeenCalledWith(oldState, newState);
            expect(logEvent).not.toHaveBeenCalled();
        });
    });

    describe('Event Handler Properties', () => {
        it('should have correct event name', () => {
            expect(voiceStateUpdateHandler.name).toBe('voiceStateUpdate');
        });

        it('should not be a once handler', () => {
            expect(voiceStateUpdateHandler.once).toBe(false);
        });
    });

    describe('Guild Resolution', () => {
        it('should use guild from newState when available', async () => {
            const oldState = createMockVoiceState({
                member: mockMember,
                channel: voiceChannel1,
                guild: null
            });
            
            const newState = createMockVoiceState({
                member: mockMember,
                channel: voiceChannel2,
                guild: mockGuild
            });
            
            createVoiceChangeEmbed.mockReturnValue({ type: 'move' });
            
            await voiceStateUpdateHandler.execute(oldState, newState, mockClient);
            
            expect(logEvent).toHaveBeenCalledWith(mockGuild, 'voiceChanges', expect.anything());
        });

        it('should fall back to guild from oldState when newState guild is null', async () => {
            const oldGuild = createMockGuild({ id: 'oldGuild' });
            
            const oldState = createMockVoiceState({
                member: mockMember,
                channel: voiceChannel1,
                guild: oldGuild
            });
            
            const newState = createMockVoiceState({
                member: mockMember,
                channel: null,
                guild: null
            });
            
            createVoiceChangeEmbed.mockReturnValue({ type: 'leave' });
            
            await voiceStateUpdateHandler.execute(oldState, newState, mockClient);
            
            expect(logEvent).toHaveBeenCalledWith(oldGuild, 'voiceChanges', expect.anything());
        });
    });

    describe('Member Resolution', () => {
        it('should get member from newState when available', async () => {
            const oldState = createMockVoiceState({
                member: null,
                channel: null,
                guild: mockGuild
            });
            
            const newState = createMockVoiceState({
                member: mockMember,
                channel: voiceChannel1,
                guild: mockGuild
            });
            
            createVoiceChangeEmbed.mockReturnValue({ type: 'join' });
            
            await voiceStateUpdateHandler.execute(oldState, newState, mockClient);
            
            expect(logEvent).toHaveBeenCalled();
        });

        it('should fall back to member from oldState', async () => {
            const oldState = createMockVoiceState({
                member: mockMember,
                channel: voiceChannel1,
                guild: mockGuild
            });
            
            const newState = createMockVoiceState({
                member: null,
                channel: null,
                guild: mockGuild
            });
            
            createVoiceChangeEmbed.mockReturnValue({ type: 'leave' });
            
            await voiceStateUpdateHandler.execute(oldState, newState, mockClient);
            
            expect(logEvent).toHaveBeenCalled();
        });
    });
});
