import discord
from discord.ext import commands
import os
import sys
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Get the bot token from environment variables
TOKEN = os.getenv('DISCORD_BOT_TOKEN')

# Create a bot instance with a command prefix
bot = commands.Bot(command_prefix='!', intents=discord.Intents.all())

@bot.event
async def on_ready():
    print(f'Bot is ready. Logged in as {bot.user}')

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

    # Process commands
    await bot.process_commands(message)

@bot.command()
@commands.has_permissions(administrator=True)
async def reboot(ctx):
    """Reboot the bot (Admin only)"""
    await ctx.send("🔄 Rebooting...")
    os.execv(sys.executable, [sys.executable] + sys.argv)

@bot.command()
@commands.has_permissions(administrator=True)
async def shutdown(ctx):
    """Shutdown the bot (Admin only)"""
    await ctx.send("🛑 Shutting down...")
    await bot.close()

# Run the bot
bot.run(TOKEN)
