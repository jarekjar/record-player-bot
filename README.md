# Discord Bot

A simple Discord bot built with discord.js.

## Setup Instructions

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file in the root directory and add your Discord bot token:
   ```
   DISCORD_TOKEN=your_bot_token_here
   ```

3. To get your bot token:
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Create a new application
   - Go to the "Bot" section
   - Click "Add Bot"
   - Copy the token and paste it in your `.env` file

4. Run the bot:
   - Development mode (with auto-reload):
     ```bash
     npm run dev
     ```
   - Production mode:
     ```bash
     npm start
     ```

## Features

- `!ping` - Responds with "Pong! 🏓"

## Adding More Commands

To add more commands, edit the `src/index.js` file and add new conditions in the message event handler. 