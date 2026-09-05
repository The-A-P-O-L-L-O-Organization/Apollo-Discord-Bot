import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    createMockInteraction,
    createMockUser
} from '../mocks/discord.js';

vi.mock('../../src/config/config.js', () => ({
    config: {
        operator: {
            agreed: true,
            contact: 'Discord: @operator#0001 or email operator@example.com'
        }
    }
}));

vi.mock('../../src/utils/startupChecks.js', () => ({
    assertOperatorAgreement: vi.fn()
}));

import { config } from '../../src/config/config.js';
import operatorContactCommand from '../../src/plugins/utility/commands/operatorcontact.js';

describe('Operator Contact Command', () => {
    let mockInteraction;

    beforeEach(() => {
        vi.clearAllMocks();
        config.operator.agreed = true;
        config.operator.contact = 'Discord: @operator#0001 or email operator@example.com';

        mockInteraction = createMockInteraction({
            user: createMockUser({ id: 'user123', tag: 'TestUser#0001' })
        });
    });

    describe('Command Metadata', () => {
        it('should have correct name', () => {
            expect(operatorContactCommand.name).toBe('operator-contact');
        });

        it('should have a description', () => {
            expect(operatorContactCommand.description).toBeTruthy();
        });

        it('should be in utility category', () => {
            expect(operatorContactCommand.category).toBe('Utility');
        });

        it('should allow DM usage', () => {
            expect(operatorContactCommand.dmPermission).toBe(true);
        });
    });

    describe('execute - Happy Path', () => {
        it('should reply ephemerally with operator contact', async() => {
            await operatorContactCommand.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    flags: expect.anything(),
                    embeds: expect.any(Array)
                })
            );
        });

        it('should include the operator contact in the embed', async() => {
            await operatorContactCommand.execute(mockInteraction);

            const call = mockInteraction.reply.mock.calls[0][0];
            const embed = call.embeds[0];
            const flat = JSON.stringify(embed);
            expect(flat).toContain('@operator#0001');
            expect(flat).toContain('operator@example.com');
        });

        it('should explain what the contact is for', async() => {
            await operatorContactCommand.execute(mockInteraction);

            const call = mockInteraction.reply.mock.calls[0][0];
            const embed = call.embeds[0];
            const flat = JSON.stringify(embed).toLowerCase();
            expect(flat).toContain('privacy');
            expect(flat).toContain('deletion');
        });
    });

    describe('execute - Missing Configuration', () => {
        it('should reply with error when operator has not agreed', async() => {
            config.operator.agreed = false;

            await operatorContactCommand.execute(mockInteraction);

            const call = mockInteraction.reply.mock.calls[0][0];
            const flat = JSON.stringify(call).toLowerCase();
            expect(flat).toContain('not configured');
        });

        it('should reply with error when contact is empty', async() => {
            config.operator.contact = '';

            await operatorContactCommand.execute(mockInteraction);

            const call = mockInteraction.reply.mock.calls[0][0];
            const flat = JSON.stringify(call).toLowerCase();
            expect(flat).toContain('not configured');
        });
    });
});
