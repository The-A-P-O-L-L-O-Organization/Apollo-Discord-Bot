import Plugin from '../../core/Plugin.js';

export default class AutomodPlugin extends Plugin {
  static id = 'automod';
  static version = '1.0.0';
  static dependencies = [];
  
  // TensorFlow needs more memory
  static resourceLimits = {
    maxOldGenerationSizeMb: 512,
    maxYoungGenerationSizeMb: 128,
    stackSizeMb: 16
  };

  async onEnable() {
    await this._loadCommands();
    await this._loadEvents();
  }

  async onDisable() {
    this._unloadCommands();
    this._unloadEvents();
  }
}
