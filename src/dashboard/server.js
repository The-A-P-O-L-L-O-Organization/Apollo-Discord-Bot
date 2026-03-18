// Dashboard API Server
// Lightweight Express REST API consumed by the Next.js dashboard.
// Protected by a Bearer token set in DASHBOARD_TOKEN env var.

import express from 'express';
import {
    getGuildData,
    setGuildData,
    getAllGuildData,
    getUserData,
    getAllUserData,
    setUserData,
} from '../utils/db.js';

const PORT  = parseInt(process.env.DASHBOARD_PORT || '3001', 10);
const TOKEN = process.env.DASHBOARD_TOKEN || '';

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------
function requireToken(req, res, next) {
    if (!TOKEN) {
        // No token configured — refuse all requests
        return res.status(503).json({ error: 'Dashboard token not configured' });
    }
    const auth = req.headers.authorization || '';
    if (auth !== `Bearer ${TOKEN}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    next();
}

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
export function startDashboardServer(discordClient) {
    const app = express();
    app.use(express.json());

    // CORS — allow the Next.js dev server and any configured origin
    app.use((req, res, next) => {
        const origin = req.headers.origin || '*';
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        if (req.method === 'OPTIONS') return res.sendStatus(204);
        next();
    });

    // All routes require a valid token
    app.use(requireToken);

    // -----------------------------------------------------------------------
    // Guilds — list all guilds the bot is in
    // -----------------------------------------------------------------------
    app.get('/api/guilds', (req, res) => {
        const guilds = Array.from(discordClient.guilds.cache.values()).map(g => ({
            id:          g.id,
            name:        g.name,
            icon:        g.iconURL({ size: 64 }),
            memberCount: g.memberCount,
        }));
        res.json(guilds);
    });

    // -----------------------------------------------------------------------
    // Blacklist
    // -----------------------------------------------------------------------
    app.get('/api/guilds/:guildId/blacklist', (req, res) => {
        const data = getGuildData('blacklist', req.params.guildId);
        res.json(data.entries || {});
    });

    app.delete('/api/guilds/:guildId/blacklist/:userId', (req, res) => {
        const { guildId, userId } = req.params;
        const data    = getGuildData('blacklist', guildId);
        const entries = data.entries || {};
        if (!entries[userId]) return res.status(404).json({ error: 'Not found' });
        delete entries[userId];
        setGuildData('blacklist', guildId, { entries });
        res.json({ ok: true });
    });

    // -----------------------------------------------------------------------
    // Warnings config
    // -----------------------------------------------------------------------
    app.get('/api/guilds/:guildId/warnings-config', (req, res) => {
        res.json(getGuildData('warnings-config', req.params.guildId));
    });

    app.put('/api/guilds/:guildId/warnings-config', (req, res) => {
        const { guildId } = req.params;
        const { thresholds, muteDuration } = req.body;
        const current = getGuildData('warnings-config', guildId);
        const next = {
            ...current,
            ...(thresholds    ? { thresholds }    : {}),
            ...(muteDuration  ? { muteDuration }  : {}),
        };
        setGuildData('warnings-config', guildId, next);
        res.json(next);
    });

    // -----------------------------------------------------------------------
    // Warnings list per guild
    // -----------------------------------------------------------------------
    app.get('/api/guilds/:guildId/warnings', (req, res) => {
        const rows = getAllUserData('warnings', req.params.guildId);
        res.json(rows);
    });

    app.delete('/api/guilds/:guildId/warnings/:userId', (req, res) => {
        const { guildId, userId } = req.params;
        const existing = getUserData('warnings', guildId, userId);
        if (!existing) return res.status(404).json({ error: 'No warnings found' });
        // Mark all warnings as cleared rather than deleting the row
        const cleared = Array.isArray(existing)
            ? existing.map(w => ({ ...w, active: false, clearedAt: Date.now(), clearedBy: 'dashboard' }))
            : [];
        setUserData('warnings', guildId, userId, cleared);
        res.json({ ok: true, clearedCount: cleared.length });
    });

    // -----------------------------------------------------------------------
    // Logging config
    // -----------------------------------------------------------------------
    app.get('/api/guilds/:guildId/logging', (req, res) => {
        res.json(getGuildData('logging', req.params.guildId));
    });

    app.put('/api/guilds/:guildId/logging', (req, res) => {
        const { guildId } = req.params;
        const { channelId, events } = req.body;
        const current = getGuildData('logging', guildId);
        const next = {
            ...current,
            ...(channelId !== undefined ? { channelId } : {}),
            ...(events    !== undefined ? { events }    : {}),
        };
        setGuildData('logging', guildId, next);
        res.json(next);
    });

    // -----------------------------------------------------------------------
    // Channels list (for channel pickers in the UI)
    // -----------------------------------------------------------------------
    app.get('/api/guilds/:guildId/channels', async (req, res) => {
        try {
            const guild = await discordClient.guilds.fetch(req.params.guildId);
            await guild.channels.fetch();
            const channels = Array.from(guild.channels.cache.values())
                .filter(c => c.isTextBased && c.isTextBased())
                .map(c => ({ id: c.id, name: c.name, type: c.type }));
            res.json(channels);
        } catch {
            res.status(404).json({ error: 'Guild not found or bot has no access' });
        }
    });

    // -----------------------------------------------------------------------
    // Start listening
    // -----------------------------------------------------------------------
    app.listen(PORT, () => {
        console.log(`[DASHBOARD] API server listening on http://localhost:${PORT}`);
    });

    return app;
}
