import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createMockInteraction,
    createMockUser,
    createMockChannel,
    createMockGuild
} from '../mocks/discord.js';

vi.mock('../../src/utils/db.js', () => ({
    getAllGuildData: vi.fn(),
    setGuildData: vi.fn(),
    getUserData: vi.fn(),
    setUserData: vi.fn()
}));

vi.mock('../../src/utils/securityLog.js', () => ({
    logSecurityEvent: vi.fn()
}));

import { getAllGuildData, setGuildData, getUserData, setUserData } from '../../src/utils/db.js';
import { logSecurityEvent } from '../../src/utils/securityLog.js';
import dataDeletionCommand, { deleteUserData, buildDeletionSummary } from '../../src/plugins/utility/commands/datadeletion.js';

describe('Data Deletion Command', () => {
    let mockInteraction;

    beforeEach(() => {
        vi.clearAllMocks();

        mockInteraction = createMockInteraction({
            user: createMockUser({ id: 'user123', tag: 'TestUser#0001' }),
            channel: createMockChannel({ id: 'channel123' }),
            guild: createMockGuild({ id: 'guild123' })
        });

        mockInteraction.awaitMessageComponent = vi.fn();
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(dataDeletionCommand.name).toBe('data-deletion');
        });

        it('should have a description', () => {
            expect(dataDeletionCommand.description).toBeTruthy();
        });

        it('should be in utility category', () => {
            expect(dataDeletionCommand.category).toBe('utility');
        });

        it('should allow DM usage', () => {
            expect(dataDeletionCommand.dmPermission).toBe(true);
        });
    });

    describe('execute - Initial Prompt', () => {
        beforeEach(() => {
            mockInteraction.awaitMessageComponent.mockRejectedValue(new Error('time'));
        });

        it('should reply ephemerally with confirmation embed', async() => {
            await dataDeletionCommand.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    flags: expect.anything(),
                    embeds: expect.any(Array),
                    components: expect.any(Array)
                })
            );
        });

        it('should include Accept and Cancel buttons', async() => {
            await dataDeletionCommand.execute(mockInteraction);

            const call = mockInteraction.reply.mock.calls[0][0];
            const row = call.components[0];
            expect(row.components).toHaveLength(2);
            const labels = row.components.map(c => c.data.label);
            expect(labels).toContain('Delete My Data');
            expect(labels).toContain('Cancel');
        });

        it('should warn about irreversibility in the embed', async() => {
            await dataDeletionCommand.execute(mockInteraction);

            const call = mockInteraction.reply.mock.calls[0][0];
            const embed = call.embeds[0];
            const flat = JSON.stringify(embed);
            expect(flat.toLowerCase()).toContain('permanent');
        });
    });

    describe('execute - Cancel Flow', () => {
        it('should reply with cancellation when user cancels', async() => {
            const cancelInteraction = {
                customId: 'data_deletion_cancel',
                user: { id: 'user123' },
                update: vi.fn().mockResolvedValue()
            };
            mockInteraction.awaitMessageComponent.mockResolvedValue(cancelInteraction);

            await dataDeletionCommand.execute(mockInteraction);

            expect(cancelInteraction.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.any(Array),
                    components: []
                })
            );
            const updateCall = cancelInteraction.update.mock.calls[0][0];
            expect(JSON.stringify(updateCall).toLowerCase()).toContain('cancel');
        });
    });

    describe('execute - Accept Flow', () => {
        beforeEach(() => {
            getAllGuildData.mockResolvedValue([]);
            getUserData.mockResolvedValue(undefined);
            setGuildData.mockResolvedValue();
            setUserData.mockResolvedValue();
        });

        it('should reject when a different user clicks Accept', async() => {
            const otherUserInteraction = {
                customId: 'data_deletion_accept',
                user: { id: 'different-user' },
                update: vi.fn().mockResolvedValue()
            };
            mockInteraction.awaitMessageComponent.mockResolvedValue(otherUserInteraction);

            await dataDeletionCommand.execute(mockInteraction);

            expect(otherUserInteraction.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.any(Array),
                    components: []
                })
            );
            const updateCall = otherUserInteraction.update.mock.calls[0][0];
            expect(JSON.stringify(updateCall)).toContain('not yours');
        });

        it('should call deleteUserData when owner accepts', async() => {
            const acceptInteraction = {
                customId: 'data_deletion_accept',
                user: { id: 'user123' },
                update: vi.fn().mockResolvedValue()
            };
            mockInteraction.awaitMessageComponent.mockResolvedValue(acceptInteraction);

            await dataDeletionCommand.execute(mockInteraction);

            expect(acceptInteraction.update).toHaveBeenCalled();
        });

        it('should reply with no-data message when user has no records', async() => {
            getAllGuildData.mockResolvedValue([]);
            getUserData.mockResolvedValue(undefined);

            const acceptInteraction = {
                customId: 'data_deletion_accept',
                user: { id: 'user123' },
                update: vi.fn().mockResolvedValue()
            };
            mockInteraction.awaitMessageComponent.mockResolvedValue(acceptInteraction);

            await dataDeletionCommand.execute(mockInteraction);

            const updateCall = acceptInteraction.update.mock.calls[0][0];
            expect(JSON.stringify(updateCall).toLowerCase()).toContain('no data');
        });

        it('should log a security event on successful deletion', async() => {
            getAllGuildData.mockResolvedValue([
                { guildId: 'guild123', data: { warnings: [{ userId: 'user123' }] } }
            ]);

            const acceptInteraction = {
                customId: 'data_deletion_accept',
                user: { id: 'user123' },
                update: vi.fn().mockResolvedValue()
            };
            mockInteraction.awaitMessageComponent.mockResolvedValue(acceptInteraction);

            await dataDeletionCommand.execute(mockInteraction);

            expect(logSecurityEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    event: 'data_deletion_request',
                    userId: 'user123'
                })
            );
        });
    });

    describe('execute - Timeout', () => {
        it('should handle collector timeout gracefully', async() => {
            const timeoutError = new Error('Collector received no interactions before ending with reason: time');
            mockInteraction.awaitMessageComponent.mockRejectedValue(timeoutError);

            await expect(dataDeletionCommand.execute(mockInteraction)).resolves.not.toThrow();
        });
    });
});

describe('deleteUserData helper', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should return zero counts when no data exists', async() => {
        getAllGuildData.mockResolvedValue([]);
        getUserData.mockResolvedValue(undefined);

        const summary = await deleteUserData('user123');

        expect(summary.total).toBe(0);
        expect(summary.byCategory).toEqual({});
    });

    it('should count and remove warnings across guilds', async() => {
        getAllGuildData.mockResolvedValue([
            {
                guildId: 'guild1',
                data: {
                    warnings: [
                        { userId: 'user123', reason: 'spam' },
                        { userId: 'user123', reason: 'spam2' },
                        { userId: 'other-user', reason: 'unrelated' }
                    ]
                }
            }
        ]);
        getUserData.mockResolvedValue(undefined);

        const summary = await deleteUserData('user123');

        expect(summary.byCategory.warnings).toBe(2);
        expect(summary.total).toBe(2);
        expect(setGuildData).toHaveBeenCalledWith(
            'warnings',
            'guild1',
            expect.objectContaining({
                warnings: expect.arrayContaining([
                    expect.objectContaining({ userId: 'other-user' })
                ])
            })
        );
    });

    it('should count and remove strikes across guilds', async() => {
        getAllGuildData.mockResolvedValue([
            {
                guildId: 'guild1',
                data: {
                    strikes: [
                        { userId: 'user123' },
                        { userId: 'user123' },
                        { userId: 'user123' }
                    ]
                }
            }
        ]);
        getUserData.mockResolvedValue(undefined);

        const summary = await deleteUserData('user123');

        expect(summary.byCategory.strikes).toBe(3);
    });

    it('should count and remove notes across guilds', async() => {
        getAllGuildData.mockResolvedValue([
            {
                guildId: 'guild1',
                data: {
                    notes: [
                        { userId: 'user123', note: 'test' }
                    ]
                }
            }
        ]);
        getUserData.mockResolvedValue(undefined);

        const summary = await deleteUserData('user123');

        expect(summary.byCategory.notes).toBe(1);
    });

    it('should count and remove XP/levels from guild_user_store', async() => {
        getAllGuildData.mockImplementation((store) => {
            if (store === 'levels') {return Promise.resolve([{ guildId: 'guild1', data: [] }]);}
            return Promise.resolve([]);
        });
        getUserData.mockImplementation((store, guildId, userId) => {
            if (store === 'levels' && userId === 'user123') {
                return Promise.resolve({ xp: 100, level: 5, messages: 50 });
            }
            return Promise.resolve(undefined);
        });

        const summary = await deleteUserData('user123');

        expect(summary.byCategory.levels).toBe(1);
        expect(setUserData).toHaveBeenCalledWith('levels', expect.any(String), 'user123', null);
    });

    it('should count and remove reminders', async() => {
        getAllGuildData.mockResolvedValue([
            {
                guildId: 'guild1',
                data: {
                    reminders: [
                        { userId: 'user123', message: 'test' },
                        { userId: 'user123', message: 'test2' }
                    ]
                }
            }
        ]);
        getUserData.mockResolvedValue(undefined);

        const summary = await deleteUserData('user123');

        expect(summary.byCategory.reminders).toBe(2);
    });

    it('should count and remove polls created by user', async() => {
        getAllGuildData.mockResolvedValue([
            {
                guildId: 'guild1',
                data: {
                    polls: [
                        { creatorId: 'user123', question: 'q1' },
                        { creatorId: 'other-user', question: 'q2' }
                    ]
                }
            }
        ]);
        getUserData.mockResolvedValue(undefined);

        const summary = await deleteUserData('user123');

        expect(summary.byCategory.polls).toBe(1);
    });

    it('should count and remove giveaways created by user', async() => {
        getAllGuildData.mockResolvedValue([
            {
                guildId: 'guild1',
                data: {
                    giveaways: [
                        { creatorId: 'user123', prize: 'p1' },
                        { creatorId: 'user123', prize: 'p2' }
                    ]
                }
            }
        ]);
        getUserData.mockResolvedValue(undefined);

        const summary = await deleteUserData('user123');

        expect(summary.byCategory.giveaways).toBe(2);
    });

    it('should count and remove tags created by user', async() => {
        getAllGuildData.mockResolvedValue([
            {
                guildId: 'guild1',
                data: {
                    tags: [
                        { ownerId: 'user123', name: 'tag1' }
                    ]
                }
            }
        ]);
        getUserData.mockResolvedValue(undefined);

        const summary = await deleteUserData('user123');

        expect(summary.byCategory.tags).toBe(1);
    });

    it('should count and remove tickets where user is creator or participant', async() => {
        getAllGuildData.mockResolvedValue([
            {
                guildId: 'guild1',
                data: {
                    openTickets: [
                        { id: 't1', creatorId: 'user123' },
                        { id: 't2', participants: ['user123', 'staff1'] },
                        { id: 't3', creatorId: 'other-user' }
                    ],
                    closedTickets: [
                        { id: 't4', creatorId: 'user123' }
                    ]
                }
            }
        ]);
        getUserData.mockResolvedValue(undefined);

        const summary = await deleteUserData('user123');

        expect(summary.byCategory.tickets).toBe(3);
    });

    it('should aggregate counts across multiple guilds', async() => {
        getAllGuildData.mockResolvedValue([
            { guildId: 'guild1', data: { warnings: [{ userId: 'user123' }] } },
            { guildId: 'guild2', data: { warnings: [{ userId: 'user123' }, { userId: 'user123' }] } }
        ]);
        getUserData.mockResolvedValue(undefined);

        const summary = await deleteUserData('user123');

        expect(summary.byCategory.warnings).toBe(3);
        expect(summary.total).toBe(3);
    });
});

describe('buildDeletionSummary helper', () => {
    it('should return a human-readable summary', () => {
        const summary = {
            total: 5,
            byCategory: {
                warnings: 3,
                strikes: 2
            }
        };

        const text = buildDeletionSummary(summary);

        expect(text).toContain('3');
        expect(text).toContain('2');
        expect(text.toLowerCase()).toContain('warning');
        expect(text.toLowerCase()).toContain('strike');
    });

    it('should handle empty summary', () => {
        const text = buildDeletionSummary({ total: 0, byCategory: {} });
        expect(text.toLowerCase()).toContain('no data');
    });
});
