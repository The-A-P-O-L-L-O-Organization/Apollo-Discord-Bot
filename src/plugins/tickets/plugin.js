import Plugin from '../../core/Plugin.js';

export default class TicketsPlugin extends Plugin {
  static id = 'tickets';
  static version = '1.0.0';
  static dependencies = [];

  async onEnable() {
    await this._loadCommands();
    await this._loadEvents();
  }

  async onDisable() {
    this._unloadCommands();
    this._unloadEvents();
  }
}
