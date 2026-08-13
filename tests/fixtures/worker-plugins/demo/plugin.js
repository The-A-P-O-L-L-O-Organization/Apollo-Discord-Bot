export default class DemoPlugin {
    static get id() { return 'demo'; }

    constructor(host) {
        this.host = host;
        this.lastMessage = null;
    }

    async onLoad() {}

    async onEvent(payload) {
        if (payload.event === 'events:messageCreate') {
            this.lastMessage = payload.data;
        }
    }

    async onCommand(payload) {
        return { ok: true, echoed: payload.name };
    }
}
