
                import { Plugin } from '../../src/core/Plugin.js'
                export default class InstallTestPlugin extends Plugin {
                    static override get id() { return 'install-test-plugin' }
                    static override version = '1.0.0'
                    static override description = 'Install test plugin'
                    static override capabilities = []
                    constructor() { super({} as any, {} as any) }
                    override onLoad() { return Promise.resolve() }
                    override onEnable() { return Promise.resolve() }
                    override onDisable() { return Promise.resolve() }
                    override onUnload() { return Promise.resolve() }
                    override getCommands() { return [] }
                }
            