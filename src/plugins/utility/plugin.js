import Plugin from '../../core/Plugin.js';
import { initReminderScheduler, stopReminderScheduler } from '../../utils/reminderScheduler.js';
import { initPollScheduler, stopPollScheduler } from '../../utils/pollScheduler.js';
import { initAnalyticsCollector, stopAnalyticsCollector } from '../../utils/analyticsCollector.js';

export default class UtilityPlugin extends Plugin {
  static id = 'utility';
  static version = '1.0.0';
  static dependencies = [];

  async onEnable() {
    await this._loadCommands();
    await this._loadEvents();
    initReminderScheduler(this.client);
    initPollScheduler(this.client);
    initAnalyticsCollector(this.client);
  }

  async onDisable() {
    this._unloadCommands();
    this._unloadEvents();
    this._stopSchedulers();
    stopReminderScheduler();
    stopPollScheduler();
    stopAnalyticsCollector();
  }
}
