import discord
from discord import app_commands
import os
import sys
import random
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Get the bot token from environment variables
TOKEN = os.getenv('DISCORD_BOT_TOKEN')

# Create a bot instance with intents
intents = discord.Intents.default()
intents.members = True
intents.message_content = True
bot = discord.Client(intents=intents)
tree = app_commands.CommandTree(bot)

# Guild ID for faster command registration
GUILD_ID = 1411714476113133680

@bot.event
async def on_ready():
    print(f'Bot is ready. Logged in as {bot.user}')
    # Sync the command tree to the specific guild for faster availability
    guild = discord.Object(id=GUILD_ID)
    await tree.sync(guild=guild)
    print(f'Commands synced to guild {GUILD_ID}')

@bot.event
async def on_member_join(member):
    # Greet new members in the system channel or a specific channel
    channel = member.guild.system_channel
    if channel is not None:
        await channel.send(f'Welcome to the server, {member.mention}!')

@bot.event
async def on_message(message):
    # Avoid responding to own messages
    if message.author == bot.user:
        return

    # Check if the bot is mentioned
    if bot.user in message.mentions:
        await message.channel.send(f'Hi!, {message.author.mention}')

@tree.command(name="reboot", description="Reboot the bot (Admin only)")
@app_commands.checks.has_permissions(administrator=True)
async def reboot(interaction: discord.Interaction):
    await interaction.response.send_message("🔄 Rebooting...")
    os.execv(sys.executable, [sys.executable] + sys.argv)

@tree.command(name="shutdown", description="Shutdown the bot (Admin only)")
@app_commands.checks.has_permissions(administrator=True)
async def shutdown(interaction: discord.Interaction):
    await interaction.response.send_message("🛑 Shutting down...")
    await bot.close()

@tree.command(name="games", description="Play Rock-Paper-Scissors with the bot")
@app_commands.describe(choice="Choose your move")
@app_commands.choices(choice=[
    app_commands.Choice(name="Rock", value="rock"),
    app_commands.Choice(name="Paper", value="paper"),
    app_commands.Choice(name="Scissors", value="scissors")
])
async def games(interaction: discord.Interaction, choice: str):
    user_choice = choice.lower()
    bot_choice = random.choice(["rock", "paper", "scissors"])

    # Determine the winner
    if user_choice == bot_choice:
        result = "It's a tie! 🤝"
    elif (user_choice == "rock" and bot_choice == "scissors") or \
         (user_choice == "paper" and bot_choice == "rock") or \
         (user_choice == "scissors" and bot_choice == "paper"):
        result = "You win! 🎉"
    else:
        result = "I win! 😎"

    # Create emoji representations
    emoji_map = {"rock": "🪨", "paper": "📄", "scissors": "✂️"}
    user_emoji = emoji_map.get(user_choice, user_choice)
    bot_emoji = emoji_map.get(bot_choice, bot_choice)

    response = f"You chose {user_emoji} {user_choice.capitalize()}\nI chose {bot_emoji} {bot_choice.capitalize()}\n\n{result}"
    await interaction.response.send_message(response)

# Run the bot
bot.run(TOKEN)
