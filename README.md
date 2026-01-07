# John Discord Bot

A Discord bot built with discord.js that welcomes new users and provides useful utility commands.

## Features

- **Welcome System**: Automatically greets new members when they join the server
- **Utility Commands**: Includes helpful commands for server management
- **Easy to Extend**: Modular architecture makes it simple to add new features
- **Rich Embeds**: Beautiful, formatted messages for better user experience

## Commands

### Available Commands

1. **/ping** - Check the bot's latency and response time
   - Measures round-trip latency
   - Shows API latency
   - Displays connection status

2. **/help** - Shows the help menu with all available commands
   - Lists all commands by category
   - Provides usage instructions
   - Shows command descriptions

3. **/userinfo** - Displays information about a user
   - Shows username, ID, and account age
   - Displays join date and server position
   - Lists roles and status

## Installation

### Prerequisites

- Node.js 18.0 or higher
- pnpm (recommended) or npm
- A Discord bot token

### Setup Steps

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd John-Discord-Bot
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit the `.env` file and add your Discord bot token:
   ```
   DISCORD_TOKEN=your-discord-bot-token-here
   ```

4. **Set up your Discord server**
   - Create a channel named "welcome" for welcome messages (optional)
   - Invite the bot to your server with appropriate permissions

5. **Start the bot**
   ```bash
   pnpm start
   ```

6. **Deploy commands** (optional, for slash commands)
   ```bash
   node deploy-commands.js
   ```

## Configuration

All configuration is managed through `src/config/config.js`. Key settings include:

```javascript
export const config = {
    // Discord Bot Token
    DISCORD_TOKEN: process.env.DISCORD_TOKEN,
    
    // Bot Activity/Status
    activity: {
        name: 'for new members join',
        type: 'WATCHING'
    },
    
    // Welcome Message Settings
    welcome: {
        channelName: 'welcome',
        message: 'Welcome {user} to {server}!'
    },
    
    // Command Prefix
    prefix: '!'
};
```

## Project Structure

```
John-Discord-Bot/
├── src/
│   ├── index.js              # Main entry point
│   ├── config/
│   │   └── config.js         # Bot configuration
│   ├── commands/
│   │   ├── ping.js           # Ping command
│   │   ├── help.js           # Help command
│   │   └── userinfo.js       # User info command
│   ├── events/
│   │   ├── ready.js          # Ready event handler
│   │   └── guildMemberAdd.js # Welcome event handler
│   └── handlers/
│       └── commandHandler.js # Command registration
├── deploy-commands.js        # Command deployment script
├── .env.example              # Environment template
├── package.json              # Project dependencies
└── pnpm-lock.yaml            # Locked dependencies
```

## Usage

### Starting the Bot

```bash
# Start in normal mode
pnpm start

# Start in development mode (with auto-restart)
pnpm dev
```

### Inviting the Bot

When inviting the bot to your server, ensure it has the following permissions:
- Send Messages
- Embed Links
- Manage Roles (for role-based features)
- View Channels
- Add Reactions (optional)

### Managing Commands

Commands are registered automatically when the bot starts. For immediate updates to commands:

1. **Guild-specific commands** (immediate):
   ```bash
   # Edit deploy-commands.js to uncomment guild deployment
   node deploy-commands.js
   ```

2. **Global commands** (can take up to 1 hour):
   ```bash
   node deploy-commands.js
   ```

## Adding New Commands

1. Create a new file in `src/commands/`
2. Follow the structure of existing commands:
   ```javascript
   import { ApplicationCommandType } from 'discord.js';
   
   export default {
       name: 'commandname',
       description: 'Your command description',
       type: ApplicationCommandType.ChatInput,
       
       async execute(interaction) {
           // Your command logic here
       }
   };
   ```
3. The command will be automatically loaded on next bot restart

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| DISCORD_TOKEN | Your Discord bot token | Yes |

## Troubleshooting

### Bot won't start
- Check that your `.env` file contains a valid Discord token
- Ensure all dependencies are installed with `pnpm install`

### Commands not appearing
- Try deploying commands manually with `node deploy-commands.js`
- Global commands can take up to 1 hour to update
- Check that the bot has proper permissions

### Welcome messages not sending
- Verify a "welcome" channel exists (or check server settings)
- Ensure the bot has permission to send messages in the channel

## Technologies Used

- **discord.js** - Discord API wrapper for Node.js
- **Node.js** - JavaScript runtime
- **pnpm** - Package manager

## License

This project is licensed under the GPLv3 License - see the LICENSE file for details.

## Support

For issues and feature requests, please create an issue in the repository.

## Acknowledgments

- [discord.js](https://discord.js.org/) - Powerful Discord API library
- [Discord Developer Portal](https://discord.com/developers/applications) - Bot management

