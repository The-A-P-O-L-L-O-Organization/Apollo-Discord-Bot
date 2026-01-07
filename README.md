# Discord Bot

This is a simple Discord bot built with Python using the discord.py library.

## Features

- Greets new members when they join the server.
- Responds with "Hi!, {pinger}" when pinged (mentioned) in a message.
- **/reboot**: Restarts the bot (Administrator only).
- **/shutdown**: Gracefully shuts down the bot (Administrator only).
- **/games**: Play Rock-Paper-Scissors with the bot.

## Slash Commands

The bot uses slash commands that are registered to your specific Discord server for faster availability. Commands should appear immediately after the bot starts.

## Setup

1. Make sure you have Python installed (version 3.8 or higher recommended).
2. Install the required dependencies:
   ```
   pip install -r requirements.txt
   ```
3. Create a `.env` file in the same directory as `bot.py` and add your bot token:
   ```
   DISCORD_BOT_TOKEN=your_bot_token_here
   ```
   Replace `your_bot_token_here` with your actual Discord bot token.

## Running the Bot

1. Navigate to the `discord_bot` directory.
2. Run the bot:
   ```
   python bot.py
   ```

The bot will connect to your Discord server using the provided token. Make sure the bot has the necessary permissions in your server (e.g., to send messages and read message history).

## Security Note

For production use, it's recommended to store the bot token in an environment variable or a separate config file instead of hardcoding it in the script. You can modify the script to load the token from an environment variable like this:

```python
import os
TOKEN = os.getenv('DISCORD_BOT_TOKEN')
```

Then set the environment variable before running the bot:
```
export DISCORD_BOT_TOKEN='your_token_here'
python bot.py
```

## Running on GitHub Actions

You can run this bot persistently using GitHub Actions runners. Note the following limitations:

- **Time Limits**: GitHub Actions workflows have time limits (6 hours for public repos, 35 days for private repos)
- **Cost**: This will consume your GitHub Actions minutes
- **Not Recommended for Production**: GitHub Actions is not designed for persistent services

### Setup Instructions:

1. **Add Bot Token as GitHub Secret**:
   - Go to your repository settings
   - Navigate to "Secrets and variables" > "Actions"
   - Add a new repository secret named `DISCORD_BOT_TOKEN` with your bot token

2. **Trigger the Workflow**:
   - Go to the "Actions" tab in your repository
   - Select "Run Discord Bot" workflow
   - Click "Run workflow"

3. **Monitor the Bot**:
   - The workflow will run and keep the bot online until the time limit is reached
   - You can see the bot's logs in the workflow run details

**Note**: For a more reliable persistent hosting solution, consider using services like Heroku, Railway, or DigitalOcean instead of GitHub Actions.
