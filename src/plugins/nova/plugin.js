import Plugin from '../../core/Plugin.js';
import { initNaviScheduler, stopNaviScheduler } from './scheduler.js';

export default class NovaPlugin extends Plugin {
  static id = 'nova';
  static version = '1.0.0';
  static dependencies = [];

  async onEnable() {
    await this._loadCommands();
    initNaviScheduler(this.client);
  }

  async onDisable() {
    this._unloadCommands();
    stopNaviScheduler();
  }
}
