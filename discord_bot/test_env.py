import os
from dotenv import load_dotenv
import discord
from discord.ext import commands

# Load environment variables from .env file
load_dotenv()

# Check if the token is loaded
token = os.getenv('DISCORD_BOT_TOKEN')
if token:
    print("✓ Token loaded successfully from .env file.")
    print(f"Token length: {len(token)} characters")
else:
    print("✗ Token not found in .env file.")

# Test import of discord.py
try:
    print("✓ discord.py imported successfully.")
except ImportError as e:
    print(f"✗ Failed to import discord.py: {e}")

print("Environment check complete.")
