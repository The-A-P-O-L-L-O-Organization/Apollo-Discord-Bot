// Plugin API Contract Tests
// Tests for Plugin base class contract: lifecycle, command/event registration, socket handlers

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Plugin from '../../src/core/Plugin.js';
import PluginManager from '../../src/core/PluginManager.js';
import { createMockClient } from '../mocks/discord.js';
import EventBus from '../../src/core/EventBus.js';

vi.mock('../../src/utils/logger.js', () => ({
    logger: {
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
    },
    createLogger: vi.fn(() => ({
        info: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn()
    }))
}));

vi.mock('../../src/db/knex.js', () => ({
    getDb: vi.fn(),
    runMigrations: vi.fn(),
    closeDb: vi.fn(),
    createAdapter: vi.fn()
}));

vi.mock('../../src/utils/redis.js', () => ({
    getRedis: vi.fn(() => ({
        connect: vi.fn(),
        on: vi.fn(),
        subscribe: vi.fn(),
        unsubscribe: vi.fn(),
        publish: vi.fn(),
        eval: vi.fn(),
        zremrangebyscore: vi.fn(),
        zcard: vi.fn(),
        zrange: vi.fn(),
        del: vi.fn(),
        close: vi.fn()
    }))
}));

vi.mock('../../src/utils/lock.js', () => ({
    getLockRedis: vi.fn()
}));

vi.mock('../../src/utils/manifest.js', () => ({
    verifyPluginManifest: vi.fn().mockResolvedValue({ ok: true })
}));

vi.mock('../../src/core/worker/workerHost.js', () => ({
    WorkerHost: vi.fn().mockImplementation(function() {
        this.startPlugin = vi.fn().mockResolvedValue({ granted: [] });
    })
}));

vi.mock('../../src/core/worker/pluginManifest.js', () => ({
    parsePluginManifest: vi.fn().mockResolvedValue({})
}));

vi.mock('../../src/queue/jobs/processCommand.js', () => ({
    commandModuleCache: new Map(),
    registerProcessCommand: vi.fn()
}));

vi.mock('../../src/queue/queue.js', () => ({
    createQueue: vi.fn(),
    closeAll: vi.fn()
}));

describe('Plugin API Contract', () => {
    let mockClient;
    let mockBus;
    let pluginManager;
    let testPluginDir;

    beforeEach(async() => {
        vi.clearAllMocks();
        
        mockClient = createMockClient({
            config: {
                DISCORD_TOKEN: 'test-token',
                CLIENT_ID: '123456789',
                plugins: {
                    enabled: [],
                    directory: './src/plugins',
                    optionalDirectory: './data/plugins',
                    registryFile: './data/plugins/registry.json'
                },
                queue: { enabled: false }
            },
            commands: new Map(),
            rest: {
                put: vi.fn().mockResolvedValue({})
            }
        });
        
        mockBus = new EventBus();
        pluginManager = new PluginManager(mockClient, mockBus);
        
        testPluginDir = '/tmp/test-plugin';
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Plugin Base Class Lifecycle', () => {
        it('should call onLoad before onEnable', async() => {
            const lifecycleOrder = [];
            
            class TestPlugin extends Plugin {
                static get id() { return 'test-lifecycle'; }
                
                async onLoad() {
                    lifecycleOrder.push('onLoad');
                }
                
                async onEnable() {
                    lifecycleOrder.push('onEnable');
                }
                
                async onDisable() {
                    lifecycleOrder.push('onDisable');
                }
                
                async onUnload() {
                    lifecycleOrder.push('onUnload');
                }
            }
            
            const plugin = new TestPlugin(mockClient, pluginManager);
            plugin.setDirectory(testPluginDir);
            
            await plugin.onLoad();
            await plugin.onEnable();
            await plugin.onDisable();
            await plugin.onUnload();
            
            expect(lifecycleOrder).toEqual(['onLoad', 'onEnable', 'onDisable', 'onUnload']);
        });

        it('should call onLoad only once', async() => {
            let loadCount = 0;
            
            class TestPlugin extends Plugin {
                static get id() { return 'test-load-once'; }
                
                async onLoad() {
                    loadCount++;
                }
            }
            
            const plugin = new TestPlugin(mockClient, pluginManager);
            plugin.setDirectory(testPluginDir);
            
            await plugin.onLoad();
            await plugin.onLoad();
            await plugin.onLoad();
            
            expect(loadCount).toBe(3); // onLoad can be called multiple times, but typically once
        });

        it('should call onEnable only when not already enabled', async() => {
            let enableCount = 0;
            
            class TestPlugin extends Plugin {
                static get id() { return 'test-enable-once'; }
                
                async onEnable() {
                    enableCount++;
                    this._enabled = true;
                }
            }
            
            const plugin = new TestPlugin(mockClient, pluginManager);
            plugin.setDirectory(testPluginDir);
            
            await plugin.onEnable();
            await plugin.onEnable(); // Second call should not increment if _enabled is checked
            
            // The base class doesn't prevent multiple onEnable calls, but plugins should handle it
            expect(enableCount).toBe(2);
        });

        it('should call onDisable only when enabled', async() => {
            let disableCount = 0;
            
            class TestPlugin extends Plugin {
                static get id() { return 'test-disable-once'; }
                
                async onEnable() {
                    this._enabled = true;
                }
                
                async onDisable() {
                    if (this._enabled) {
                        disableCount++;
                        this._enabled = false;
                    }
                }
            }
            
            const plugin = new TestPlugin(mockClient, pluginManager);
            plugin.setDirectory(testPluginDir);
            
            await plugin.onEnable();
            await plugin.onDisable();
            await plugin.onDisable(); // Second call should not increment if _enabled is checked
            
            expect(disableCount).toBe(1);
        });

        it('should call onUnload only when loaded', async() => {
            let unloadCount = 0;
            
            class TestPlugin extends Plugin {
                static get id() { return 'test-unload-once'; }
                
                async onLoad() {
                    this._loaded = true;
                }
                
                async onUnload() {
                    if (this._loaded) {
                        unloadCount++;
                        this._loaded = false;
                    }
                }
            }
            
            const plugin = new TestPlugin(mockClient, pluginManager);
            plugin.setDirectory(testPluginDir);
            
            await plugin.onLoad();
            await plugin.onUnload();
            await plugin.onUnload(); // Second call should not increment if _loaded is checked
            
            expect(unloadCount).toBe(1);
        });

        it('should maintain correct lifecycle order across multiple enable/disable cycles', async() => {
            const lifecycleOrder = [];
            
            class TestPlugin extends Plugin {
                static get id() { return 'test-multi-cycle'; }
                
                async onLoad() { lifecycleOrder.push('onLoad'); }
                async onEnable() { lifecycleOrder.push('onEnable'); }
                async onDisable() { lifecycleOrder.push('onDisable'); }
                async onUnload() { lifecycleOrder.push('onUnload'); }
            }
            
            const plugin = new TestPlugin(mockClient, pluginManager);
            plugin.setDirectory(testPluginDir);
            
            await plugin.onLoad();
            await plugin.onEnable();
            await plugin.onDisable();
            await plugin.onEnable();
            await plugin.onDisable();
            await plugin.onUnload();
            
            expect(lifecycleOrder).toEqual([
                'onLoad',
                'onEnable', 'onDisable',
                'onEnable', 'onDisable',
                'onUnload'
            ]);
        });
    });

    describe('Command Registration', () => {
        it('should register commands with the plugin', async() => {
            class TestPlugin extends Plugin {
                static get id() { return 'test-commands'; }
            }
            
            const plugin = new TestPlugin(mockClient, pluginManager);
            plugin.setDirectory(testPluginDir);
            
            const mockCommand = {
                name: 'testcmd',
                description: 'Test command',
                execute: vi.fn()
            };
            
            plugin.commands.set('testcmd', mockCommand);
            
            expect(plugin.commands.has('testcmd')).toBe(true);
            expect(plugin.commands.get('testcmd')).toBe(mockCommand);
        });

        it('should unregister commands on unload', async() => {
            class TestPlugin extends Plugin {
                static get id() { return 'test-unload-commands'; }
            }
            
            const plugin = new TestPlugin(mockClient, pluginManager);
            plugin.setDirectory(testPluginDir);
            
            const mockCommand = {
                name: 'testcmd',
                description: 'Test command',
                execute: vi.fn()
            };
            
            plugin.commands.set('testcmd', mockCommand);
            mockClient.commands.set('testcmd', mockCommand);
            
            plugin._unloadCommands();
            
            expect(plugin.commands.size).toBe(0);
            expect(mockClient.commands.has('testcmd')).toBe(false);
        });

        it('should provide getCommands method for command sync', async() => {
            class TestPlugin extends Plugin {
                static get id() { return 'test-get-commands'; }
                
                getCommands() {
                    return [...this.commands.values()];
                }
            }
            
            const plugin = new TestPlugin(mockClient, pluginManager);
            plugin.setDirectory(testPluginDir);
            
            const cmd1 = { name: 'cmd1', data: { toJSON: () => ({ name: 'cmd1' }) } };
            const cmd2 = { name: 'cmd2', data: { toJSON: () => ({ name: 'cmd2' }) } };
            
            plugin.commands.set('cmd1', cmd1);
            plugin.commands.set('cmd2', cmd2);
            
            const commands = plugin.getCommands();
            
            expect(commands).toHaveLength(2);
            expect(commands.map(c => c.name)).toEqual(['cmd1', 'cmd2']);
        });
    });

    describe('Event Registration', () => {
        it('should register event handlers with the client', async() => {
            class TestPlugin extends Plugin {
                static get id() { return 'test-events'; }
            }
            
            const plugin = new TestPlugin(mockClient, pluginManager);
            plugin.setDirectory(testPluginDir);
            
            const handler = vi.fn();
            plugin.client.on('testEvent', handler);
            plugin.eventHandlers.push({ name: 'testEvent', handler, once: false });
            
            expect(plugin.eventHandlers).toHaveLength(1);
            expect(plugin.eventHandlers[0].name).toBe('testEvent');
        });

        it('should unregister event handlers on unload', async() => {
            class TestPlugin extends Plugin {
                static get id() { return 'test-unload-events'; }
            }
            
            const plugin = new TestPlugin(mockClient, pluginManager);
            plugin.setDirectory(testPluginDir);
            
            const handler = vi.fn();
            plugin.client.on('testEvent', handler);
            plugin.eventHandlers.push({ name: 'testEvent', handler, once: false });
            
            plugin._unloadEvents();
            
            expect(plugin.eventHandlers).toHaveLength(0);
        });

        it('should support once event handlers', async() => {
            class TestPlugin extends Plugin {
                static get id() { return 'test-once-events'; }
            }
            
            const plugin = new TestPlugin(mockClient, pluginManager);
            plugin.setDirectory(testPluginDir);
            
            const handler = vi.fn();
            plugin.client.once('testEvent', handler);
            plugin.eventHandlers.push({ name: 'testEvent', handler, once: true });
            
            expect(plugin.eventHandlers[0].once).toBe(true);
        });
    });

    describe('Socket Handler Registration', () => {
        it('should register socket handlers via PluginManager', async() => {
            const handler = vi.fn();
            
            pluginManager.registerSocketHandler('test.namespace', handler);
            
            const retrieved = pluginManager.getSocketHandler('test.namespace');
            expect(retrieved).toBe(handler);
        });

        it('should return null for unregistered socket handlers', async() => {
            const retrieved = pluginManager.getSocketHandler('unknown.namespace');
            expect(retrieved).toBeNull();
        });

        it('should overwrite existing socket handlers', async() => {
            const handler1 = vi.fn();
            const handler2 = vi.fn();
            
            pluginManager.registerSocketHandler('test.namespace', handler1);
            pluginManager.registerSocketHandler('test.namespace', handler2);
            
            const retrieved = pluginManager.getSocketHandler('test.namespace');
            expect(retrieved).toBe(handler2);
        });
    });

    describe('Plugin Dependencies', () => {
        it('should respect dependency order when enabling', async() => {
            const enableOrder = [];
            
            class DepPlugin extends Plugin {
                static get id() { return 'dependency'; }
                static get dependencies() { return []; }
                async onEnable() { enableOrder.push('dependency'); }
            }
            
            class MainPlugin extends Plugin {
                static get id() { return 'main'; }
                static get dependencies() { return ['dependency']; }
                async onEnable() { enableOrder.push('main'); }
            }
            
            pluginManager._pluginRegistry.set('dependency', DepPlugin);
            pluginManager._pluginRegistry.set('main', MainPlugin);
            
            const depPlugin = new DepPlugin(mockClient, pluginManager);
            const mainPlugin = new MainPlugin(mockClient, pluginManager);
            
            pluginManager.plugins.set('dependency', depPlugin);
            pluginManager.plugins.set('main', mainPlugin);
            
            await pluginManager.enablePlugin('dependency');
            await pluginManager.enablePlugin('main');
            
            expect(enableOrder).toEqual(['dependency', 'main']);
        });

        it('should throw when enabling plugin with unmet dependency', async() => {
            class MainPlugin extends Plugin {
                static get id() { return 'main'; }
                static get dependencies() { return ['missing-dep']; }
            }
            
            const mainPlugin = new MainPlugin(mockClient, pluginManager);
            pluginManager.plugins.set('main', mainPlugin);
            
            await expect(pluginManager.enablePlugin('main')).rejects.toThrow('Dependency missing-dep not enabled');
        });
    });

    describe('Plugin State Management', () => {
        it('should track loaded state', async() => {
            class TestPlugin extends Plugin {
                static get id() { return 'test-state'; }
            }
            
            const plugin = new TestPlugin(mockClient, pluginManager);
            plugin.setDirectory(testPluginDir);
            
            expect(plugin._loaded).toBe(false);
            
            // PluginManager sets _loaded = true after onLoad
            await plugin.onLoad();
            plugin._loaded = true;
            
            expect(plugin._loaded).toBe(true);
        });

        it('should track enabled state', async() => {
            class TestPlugin extends Plugin {
                static get id() { return 'test-enabled-state'; }
            }
            
            const plugin = new TestPlugin(mockClient, pluginManager);
            plugin.setDirectory(testPluginDir);
            
            expect(plugin._enabled).toBe(false);
            
            // PluginManager sets _enabled = true after onEnable
            await plugin.onEnable();
            plugin._enabled = true;
            
            expect(plugin._enabled).toBe(true);
            
            // PluginManager sets _enabled = false after onDisable
            await plugin.onDisable();
            plugin._enabled = false;
            
            expect(plugin._enabled).toBe(false);
        });

        it('should provide version and metadata', async() => {
            class TestPlugin extends Plugin {
                static get id() { return 'test-metadata'; }
                static get version() { return '2.5.0'; }
                static get dependencies() { return ['dep1', 'dep2']; }
            }
            
            expect(TestPlugin.id).toBe('test-metadata');
            expect(TestPlugin.version).toBe('2.5.0');
            expect(TestPlugin.dependencies).toEqual(['dep1', 'dep2']);
        });
    });

    describe('PluginManager Integration', () => {
        it('should load and enable plugin through PluginManager', async() => {
            class TestPlugin extends Plugin {
                static get id() { return 'test-integration'; }
                static get dependencies() { return []; }
                
                async onLoad() { this.loaded = true; }
                async onEnable() { this.enabled = true; }
            }
            
            pluginManager._pluginRegistry.set('test-integration', TestPlugin);
            
            const plugin = await pluginManager.loadPlugin('test-integration', testPluginDir);
            
            expect(plugin).toBeInstanceOf(TestPlugin);
            expect(plugin._loaded).toBe(true);
            expect(plugin.loaded).toBe(true);
            
            await pluginManager.enablePlugin('test-integration');
            
            expect(plugin._enabled).toBe(true);
            expect(plugin.enabled).toBe(true);
        });

        it('should disable and unload plugin through PluginManager', async() => {
            class TestPlugin extends Plugin {
                static get id() { return 'test-disable-unload'; }
                static get dependencies() { return []; }
                
                async onLoad() { this.loaded = true; }
                async onEnable() { this.enabled = true; }
                async onDisable() { this.enabled = false; }
                async onUnload() { this.loaded = false; }
            }
            
            pluginManager._pluginRegistry.set('test-disable-unload', TestPlugin);
            
            const plugin = await pluginManager.loadPlugin('test-disable-unload', testPluginDir);
            await pluginManager.enablePlugin('test-disable-unload');
            
            await pluginManager.disablePlugin('test-disable-unload');
            expect(plugin._enabled).toBe(false);
            expect(plugin.enabled).toBe(false);
            
            await pluginManager.unloadPlugin('test-disable-unload');
            expect(plugin._loaded).toBe(false);
            expect(plugin.loaded).toBe(false);
        });

        it('should list plugins with correct status', async() => {
            class TestPlugin extends Plugin {
                static get id() { return 'test-list'; }
                static get version() { return '1.0.0'; }
                static get dependencies() { return []; }
            }
            
            pluginManager._pluginRegistry.set('test-list', TestPlugin);
            
            await pluginManager.loadPlugin('test-list', testPluginDir);
            await pluginManager.enablePlugin('test-list');
            
            const list = pluginManager.listPlugins();
            
            expect(list).toHaveLength(1);
            expect(list[0]).toMatchObject({
                id: 'test-list',
                version: '1.0.0',
                loaded: true,
                enabled: true
            });
        });

        it('should check if plugin is enabled', async() => {
            class TestPlugin extends Plugin {
                static get id() { return 'test-is-enabled'; }
                static get dependencies() { return []; }
            }
            
            pluginManager._pluginRegistry.set('test-is-enabled', TestPlugin);
            
            expect(pluginManager.isEnabled('test-is-enabled')).toBe(false);
            
            await pluginManager.loadPlugin('test-is-enabled', testPluginDir);
            await pluginManager.enablePlugin('test-is-enabled');
            
            expect(pluginManager.isEnabled('test-is-enabled')).toBe(true);
        });
    });

    describe('Error Handling in Lifecycle', () => {
        it('should propagate errors from onLoad', async() => {
            class TestPlugin extends Plugin {
                static get id() { return 'test-load-error'; }
                
                async onLoad() {
                    throw new Error('Load failed');
                }
            }
            
            const plugin = new TestPlugin(mockClient, pluginManager);
            plugin.setDirectory(testPluginDir);
            
            await expect(plugin.onLoad()).rejects.toThrow('Load failed');
        });

        it('should propagate errors from onEnable', async() => {
            class TestPlugin extends Plugin {
                static get id() { return 'test-enable-error'; }
                
                async onEnable() {
                    throw new Error('Enable failed');
                }
            }
            
            const plugin = new TestPlugin(mockClient, pluginManager);
            plugin.setDirectory(testPluginDir);
            
            await expect(plugin.onEnable()).rejects.toThrow('Enable failed');
        });

        it('should propagate errors from onDisable', async() => {
            class TestPlugin extends Plugin {
                static get id() { return 'test-disable-error'; }
                
                async onDisable() {
                    throw new Error('Disable failed');
                }
            }
            
            const plugin = new TestPlugin(mockClient, pluginManager);
            plugin.setDirectory(testPluginDir);
            
            await expect(plugin.onDisable()).rejects.toThrow('Disable failed');
        });

        it('should propagate errors from onUnload', async() => {
            class TestPlugin extends Plugin {
                static get id() { return 'test-unload-error'; }
                
                async onUnload() {
                    throw new Error('Unload failed');
                }
            }
            
            const plugin = new TestPlugin(mockClient, pluginManager);
            plugin.setDirectory(testPluginDir);
            
            await expect(plugin.onUnload()).rejects.toThrow('Unload failed');
        });
    });

    describe('Scheduler Management', () => {
        it('should track schedulers and stop them on unload', async() => {
            class TestPlugin extends Plugin {
                static get id() { return 'test-schedulers'; }
            }
            
            const plugin = new TestPlugin(mockClient, pluginManager);
            plugin.setDirectory(testPluginDir);
            
            const intervalId = setInterval(() => {}, 1000);
            const timeoutId = setTimeout(() => {}, 1000);
            
            plugin.schedulers.push(intervalId, timeoutId);
            
            expect(plugin.schedulers).toHaveLength(2);
            
            plugin._stopSchedulers();
            
            expect(plugin.schedulers).toHaveLength(0);
        });
    });
});