import express from 'express';
import createRoutes from './routes.js';

export default class InterlinkServer {
    constructor({ registry, messageBus }) {
        this._app = express();
        this._server = null;
        this._registry = registry;
        this._messageBus = messageBus;
    }

    async start(port) {
        this._app.use(express.json());
        this._app.use('/api/v1', createRoutes({ registry: this._registry, messageBus: this._messageBus }));
        return new Promise((resolve) => {
            this._server = this._app.listen(port, () => {
                console.log(`[Interlink] HTTP server listening on port ${port}`);
                resolve();
            });
        });
    }

    async stop() {
        return new Promise((resolve) => {
            if (this._server) {
                this._server.close(() => {
                    console.log('[Interlink] HTTP server stopped');
                    resolve();
                });
            } else {
                resolve();
            }
        });
    }
}
