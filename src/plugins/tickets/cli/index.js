import { getGuildData } from '../../../utils/db.js';

export default {
    name: 'tickets',
    description: 'Ticket management',
    commands: [
        {
            name: 'list',
            description: 'List all tickets',
            options: [],
            execute: async (args) => {
                const data = await getGuildData('tickets', args.guild) || {};
                const open = (data.openTickets || []).map(t => ({
                    id: t.id,
                    ticketNumber: t.ticketNumber,
                    userId: t.userId,
                    reason: t.reason,
                    status: t.status,
                    priority: t.priority
                }));
                const closed = (data.closedTickets || []).map(t => ({
                    ticketNumber: t.ticketNumber,
                    userId: t.userId,
                    closedAt: t.closedAt
                }));
                return { openCount: open.length, closedCount: closed.length, open, closed };
            }
        },
        {
            name: 'create',
            description: 'Create a ticket',
            needsSocket: true,
            options: [
                { name: 'user', description: 'User ID', required: true },
                { name: 'reason', description: 'Ticket reason', required: false }
            ]
        },
        {
            name: 'close',
            description: 'Close a ticket',
            needsSocket: true,
            options: [
                { name: 'id', description: 'Ticket ID', required: true }
            ]
        },
        {
            name: 'add',
            description: 'Add a user to a ticket',
            needsSocket: true,
            options: [
                { name: 'id', description: 'Ticket ID', required: true },
                { name: 'user', description: 'User ID', required: true }
            ]
        },
        {
            name: 'remove',
            description: 'Remove a user from a ticket',
            needsSocket: true,
            options: [
                { name: 'id', description: 'Ticket ID', required: true },
                { name: 'user', description: 'User ID', required: true }
            ]
        }
    ]
};
