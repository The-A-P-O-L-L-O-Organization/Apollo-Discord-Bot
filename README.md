# A.P.O.L.L.O Discord Bot

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0-brightgreen.svg)](https://nodejs.org/)
[![Discord.js](https://img.shields.io/badge/discord.js-v14-blue.svg)](https://discord.js.org/)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen.svg)](https://github.com/The-A-P-O-L-L-O-Organization/Apollo-Discord-Bot)

A feature-rich Discord bot built with discord.js v14 that provides moderation, logging, tickets, reaction roles, and utility commands.

## Features

- **Welcome System**: Automatically greets new members when they join the server
- **Moderation Commands**: Full suite of moderation tools with warning system and auto-punishments
- **Auto-Moderation**: Configurable filters for spam, links, invites, caps, and banned words
- **Server Logging**: Comprehensive event logging (messages, members, roles, voice)
- **Ticket System**: Support ticket creation with transcripts saved to JSON
- **Reaction Roles**: Self-assignable roles via message reactions
- **Reminders**: Personal reminder system with scheduling
- **Polls**: Create polls with optional auto-tally when duration ends
- **Docker Support**: Easy deployment with Docker and Docker Compose
- **Rich Embeds**: Beautiful, formatted messages for better user experience
- **Comprehensive Test Suite**: Full test coverage with Vitest for all commands, events, and utilities

## Commands (29 Total)

### Utility Commands

| Command | Description |
|---------|-------------|
| `/ping` | Check the bot's latency and response time |
| `/help` | Shows the help menu with all available commands |
| `/userinfo` | Displays information about a user |
| `/serverinfo` | Display detailed server information |
| `/stats` | Display bot statistics (uptime, memory, servers) |
| `/embed` | Create custom embed messages |
| `/remind` | Set a reminder (e.g., `/remind 1h Check the oven`) |
| `/reminders` | List your active reminders |
| `/cancelreminder` | Cancel a reminder by ID |
| `/poll` | Create a poll with optional auto-tally |

### Moderation Commands

| Command | Description |
|---------|-------------|
| `/kick` | Kick a user from the server |
| `/ban` | Ban a user from the server |
| `/unban` | Unban a previously banned user |
| `/mute` | Temporarily mute a user |
| `/unmute` | Unmute a previously muted user |
| `/purge` | Delete multiple messages from a channel |
| `/warn` | Issue a warning to a user (auto-punishments at thresholds) |
| `/warnings` | View a user's warnings |
| `/clearwarnings` | Clear warnings for a user |

### Admin Commands

| Command | Description |
|---------|-------------|
| `/warnconfig` | Configure warning thresholds for auto-punishments |
| `/automod` | Configure auto-moderation settings |
| `/setlogchannel` | Set the channel for server event logs |
| `/logging` | Enable/disable specific log events |
| `/reactionrole` | Setup reaction roles (add/remove/list/clear) |
| `/ticketsetup` | Configure the ticket system |
| `/ticket` | Create a support ticket |
| `/closeticket` | Close a ticket and save transcript |

## Installation

### Prerequisites

- Node.js 18.0 or higher
- pnpm (recommended) or npm
- Docker and Docker Compose (optional, for deployment)
- A Discord bot token from [Discord Developer Portal](https://discord.com/developers/applications)

### Quick Start with Docker Compose (Recommended)

1. **Clone the repository**
   ```bash
   git clone https://github.com/The-A-P-O-L-L-O-Organization/Apollo-Discord-Bot.git
   cd Apollo-Discord-Bot
   ```

2. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```

3. **Edit the `.env` file and add your Discord bot token**
   ```
   DISCORD_TOKEN=your-discord-bot-token-here
   CLIENT_ID=your-bot-client-id
   ```

4. **Start the bot with Docker Compose**
   ```bash
   docker-compose up -d
   ```

5. **View logs**
   ```bash
   docker-compose logs -f
   ```

6. **Stop the bot**
   ```bash
   docker-compose down
   ```

### Manual Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/The-A-P-O-L-L-O-Organization/Apollo-Discord-Bot.git
   cd Apollo-Discord-Bot
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
   CLIENT_ID=your-bot-client-id
   ```

4. **Set up your Discord server**
   - Create a channel named "welcome" for welcome messages
   - Create a channel named "mod-logs" for moderation logs (optional)
   - Create a role named "Muted" for the mute feature (optional)
   - Invite the bot to your server with appropriate permissions

5. **Deploy commands** (optional, for slash commands)
   ```bash
   node deploy-commands.js
   ```

6. **Run tests** (optional, to verify the setup)
   ```bash
   pnpm test
   ```

7. **Start the bot**
   ```bash
   pnpm start
   ```

### Docker Commands Reference

```bash
# Build and start the bot
docker-compose up -d

# Start without building (if already built)
docker-compose start

# Stop the bot
docker-compose stop

# Stop and remove containers
docker-compose down

# View logs
docker-compose logs -f

# View logs for specific service
docker-compose logs -f bot

# Rebuild and start
docker-compose up -d --build

# Remove volumes (WARNING: deletes all data)
docker-compose down -v
```

### Production Deployment with Dockerfile.prod

```bash
# Build using production Dockerfile
docker build -f Dockerfile.prod -t apollo-discord-bot .

# Run the container
docker run -d \
  --name apollo-discord-bot \
  --restart unless-stopped \
  -e DISCORD_TOKEN=your-token \
  apollo-discord-bot
```

## Configuration

### Running Tests

This project includes a comprehensive test suite using Vitest. All commands, events, and utilities are tested to ensure reliability.

```bash
# Run all tests once
pnpm test

# Run tests in watch mode (during development)
pnpm test:watch

# Run tests with coverage report
pnpm test:coverage

# Run tests with UI interface
pnpm test:ui
```

**Test Coverage:**
- ✅ All 29 commands have unit tests
- ✅ All 11 event handlers have unit tests
- ✅ All utility functions have unit tests
- ✅ Mock Discord.js objects for isolated testing
- ✅ 100+ test cases covering edge cases and error handling

### Development Mode

Run the bot in development mode with auto-restart on file changes:

```bash
pnpm dev
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
    
    // Moderation Settings
    moderation: {
        defaultReason: 'No reason provided',
        muteRoleName: 'Muted',
        muteDuration: 3600000,
        maxMessagesPerPurge: 100,
        logModerationActions: true,
        moderationLogChannel: 'mod-logs'
    },
    
    // Warning System (configurable per-server)
    warnings: {
        thresholds: {
            mute: 3,   // Auto-mute at 3 warnings
            kick: 5,   // Auto-kick at 5 warnings
            ban: 7     // Auto-ban at 7 warnings
        }
    },
    
    // Auto-moderation Settings
    automod: {
        enabled: false,
        maxMentions: 5,
        maxCapsPercent: 70,
        filterInvites: true,
        filterLinks: false,
        spamThreshold: 5
    },
    
    // Logging Settings
    logging: {
        defaultEvents: {
            messageDelete: true,
            messageEdit: true,
            memberJoin: true,
            memberLeave: true,
            roleChanges: true,
            voiceChanges: false
        }
    },
    
    // Ticket System
    tickets: {
        categoryName: 'Support Tickets',
        channelPrefix: 'ticket-'
    },
    
    // Reminders
    reminders: {
        checkInterval: 30000,
        maxDuration: 30 * 24 * 60 * 60 * 1000 // 30 days
    },
    
    // Polls
    polls: {
        defaultDuration: 24 * 60 * 60 * 1000, // 24 hours
        maxDuration: 7 * 24 * 60 * 60 * 1000, // 7 days
        maxOptions: 10
    }
};
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| DISCORD_TOKEN | Your Discord bot token | Yes |
| CLIENT_ID | Your Discord application client ID | No |
| NODE_ENV | Environment mode (development/production) | No |

## Project Structure

```
Apollo-Discord-Bot/
├── src/
│   ├── index.js              # Main entry point
│   ├── config/
│   │   └── config.js         # Bot configuration
│   ├── commands/
│   │   ├── ping.js           # Ping command
│   │   ├── help.js           # Dynamic help command
│   │   ├── userinfo.js       # User info command
│   │   ├── serverinfo.js     # Server info command
│   │   ├── stats.js          # Bot statistics
│   │   ├── embed.js          # Embed creator
│   │   ├── kick.js           # Kick command
│   │   ├── ban.js            # Ban command
│   │   ├── unban.js          # Unban command
│   │   ├── mute.js           # Mute command
│   │   ├── unmute.js         # Unmute command
│   │   ├── purge.js          # Purge command
│   │   ├── warn.js           # Warning command
│   │   ├── warnings.js       # View warnings
│   │   ├── clearwarnings.js  # Clear warnings
│   │   ├── warnconfig.js     # Warning config
│   │   ├── automod.js        # Auto-moderation config
│   │   ├── setlogchannel.js  # Set log channel
│   │   ├── logging.js        # Configure logging
│   │   ├── reactionrole.js   # Reaction roles
│   │   ├── ticketsetup.js    # Ticket setup
│   │   ├── ticket.js         # Create ticket
│   │   ├── closeticket.js    # Close ticket
│   │   ├── remind.js         # Set reminder
│   │   ├── reminders.js      # List reminders
│   │   ├── cancelreminder.js # Cancel reminder
│   │   └── poll.js           # Create polls
│   ├── events/
│   │   ├── ready.js          # Ready event
│   │   ├── guildMemberAdd.js # Welcome + join logging
│   │   ├── guildMemberRemove.js # Leave logging
│   │   ├── guildMemberUpdate.js # Role change logging
│   │   ├── messageCreate.js  # Auto-moderation
│   │   ├── messageDelete.js  # Delete logging
│   │   ├── messageUpdate.js  # Edit logging
│   │   ├── messageReactionAdd.js # Reaction roles
│   │   ├── messageReactionRemove.js # Reaction roles
│   │   ├── voiceStateUpdate.js # Voice logging
│   │   └── interactionCreate.js # Button handlers
│   ├── handlers/
│   │   ├── commandHandler.js # Command registration
│   │   └── eventHandler.js   # Dynamic event loading
│   └── utils/
│       ├── modLog.js         # Moderation logging
│       ├── dataStore.js      # JSON data persistence
│       ├── automod.js        # Auto-mod checks
│       ├── logger.js         # Event logging utility
│       ├── reminderScheduler.js # Reminder scheduler
│       └── pollScheduler.js  # Poll auto-tally
├── tests/                    # Test suite (Vitest)
│   ├── commands/             # Command tests
│   ├── events/               # Event tests
│   ├── utils/                # Utility tests
│   ├── mocks/                # Mock Discord.js objects
│   │   └── discord.js        # Discord.js mocks
│   └── setup.js              # Test setup
├── data/                     # Data storage (gitignored)
│   └── transcripts/          # Ticket transcripts
├── deploy-commands.js        # Command deployment script
├── vitest.config.js          # Vitest configuration
├── Dockerfile                # Development Dockerfile
├── Dockerfile.prod           # Production Dockerfile
├── docker-compose.yml        # Docker Compose configuration
├── .env.example              # Environment template
├── .dockerignore             # Docker ignore file
├── package.json              # Project dependencies
└── pnpm-lock.yaml            # Locked dependencies
```

## Feature Details

### Warning System
- Issue warnings with `/warn @user reason`
- Configure auto-punishment thresholds per-server with `/warnconfig`
- Default: mute at 3 warnings, kick at 5, ban at 7
- View warnings with `/warnings @user`
- Clear warnings with `/clearwarnings @user`

### Auto-Moderation
Configure with `/automod`:
- **Banned words**: Add/remove words to filter
- **Invite filter**: Block Discord invite links
- **Link filter**: Block external links
- **Mention spam**: Limit mentions per message
- **Caps filter**: Limit excessive caps
- **Spam detection**: Rate limiting messages
- **Account age**: Minimum account age requirement
- **Exempt channels/roles**: Bypass automod for specific channels or roles

### Server Logging
Configure with `/setlogchannel` and `/logging`:
- Message deletes and edits
- Member joins and leaves
- Role changes
- Voice channel activity (join/leave/move)

### Ticket System
1. Setup: `/ticketsetup category`, `/ticketsetup supportrole`, `/ticketsetup panel`
2. Users click the panel button or use `/ticket` to create tickets
3. Staff with support role can view all tickets
4. Close with `/closeticket` or the close button
5. Transcripts saved to `data/transcripts/` as JSON

### Reaction Roles
- Add: `/reactionrole add message_id emoji @role`
- Remove: `/reactionrole remove message_id emoji`
- List: `/reactionrole list`
- Clear: `/reactionrole clear message_id`

### Polls
- Create: `/poll question:"Your question" options:"Option 1 | Option 2 | Option 3"`
- Optional duration: `duration:1h` for auto-tally
- Results posted automatically when poll ends

## Bot Permissions

When inviting the bot, ensure it has these permissions:
- Send Messages
- Embed Links
- Manage Roles
- Manage Messages
- Manage Channels
- Kick Members
- Ban Members
- Moderate Members (for timeout)
- View Channel
- Add Reactions
- Read Message History

## Troubleshooting

### Bot won't start
- Check that your `.env` file contains a valid Discord token
- Ensure all dependencies are installed with `pnpm install`
- Check Docker logs with `docker-compose logs`

### Commands not appearing
- Try deploying commands manually with `node deploy-commands.js`
- Global commands can take up to 1 hour to update
- Check that the bot has proper permissions

### Welcome messages not sending
- Verify a "welcome" channel exists (or check server settings)
- Ensure the bot has permission to send messages in the channel

### Logging not working
- Set the log channel with `/setlogchannel set #channel`
- Enable events with `/logging enable event_name`
- Check `/logging status` to see current configuration

### Tickets not creating
- Run `/ticketsetup category` to set the ticket category
- Ensure bot has Manage Channels permission
- Check that the category exists

## GitHub Packages

This project publishes Docker images to GitHub Container Registry (GHCR).

```bash
# Pull the latest image
docker pull ghcr.io/the-a-p-o-l-l-o-organization/apollo-discord-bot:latest

# Run the container
docker run -d \
  --name apollo-discord-bot \
  --restart unless-stopped \
  -e DISCORD_TOKEN=your-token \
  ghcr.io/the-a-p-o-l-l-o-organization/apollo-discord-bot:latest
```

## CI/CD Pipeline

This project uses GitHub Actions for continuous integration and deployment:

- **Build and Publish**: Triggered on push to main or version tags
- **Multi-platform**: Builds for amd64 and arm64
- **Security Scanning**: Automatic vulnerability scanning with Trivy
- **SBOM Generation**: Software Bill of Materials for supply chain security

## Technologies Used

- **discord.js v14** - Discord API wrapper for Node.js
- **Node.js** - JavaScript runtime
- **pnpm** - Fast, disk space efficient package manager
- **Vitest** - Blazing fast unit test framework
- **Docker** - Containerization platform
- **GitHub Actions** - CI/CD pipeline
- **GitHub Packages** - Container registry

## License

This project is licensed under the GPLv3 License - see the LICENSE file for details.

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

When contributing code:
1. Write tests for new features
2. Ensure all tests pass with `pnpm test`
3. Follow the existing code style
4. Update documentation as needed

## Support

For issues and feature requests, please create an issue in the [GitHub repository](https://github.com/The-A-P-O-L-L-O-Organization/Apollo-Discord-Bot/issues).

## Acknowledgments

- [discord.js](https://discord.js.org/) - Powerful Discord API library
- [Discord Developer Portal](https://discord.com/developers/applications) - Bot management
- [Docker](https://www.docker.com/) - Containerization platform
