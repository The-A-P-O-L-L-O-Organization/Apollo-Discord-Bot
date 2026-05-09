import Plugin from '../../core/Plugin.js';

export default class AdminPlugin extends Plugin {
  static id = 'admin';
  static version = '1.0.0';
  static dependencies = [];

  async onEnable() {
    await this._loadCommands();
  }

  async onDisable() {
    this._unloadCommands();
  }
}
