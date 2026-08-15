Responsibility
This directory contains a demo worker plugin that implements basic event handling and command response capabilities for the Apollo Discord Bot worker system.

Design
The plugin follows the ES6 class pattern implementing the standard worker plugin interface. It defines a static getter for the plugin ID and implements the lifecycle methods: onLoad, onEvent, and onCommand. State is maintained in an instance property lastMessage to store the most recent message payload.

Flow
Event data enters the plugin through the host system invoking the onEvent method with a payload object containing event type and data. When the event matches 'events:messageCreate', the payload data is stored in the lastMessage property. Command data enters via the onCommand method receiving a payload object; the plugin processes the command and returns a response object with status and echoed command name. Data leaves the plugin through return values from onEvent (undefined) and onCommand (response object).

Integration
The plugin declares dependencies in plugin.json requiring the 'events:messageCreate' event and 'api:sendMessage' API capability. It is integrated into the host system which calls the plugin's lifecycle methods (onLoad, onEvent, onCommand) and provides the event/api infrastructure. No external libraries or modules are imported within the plugin source.