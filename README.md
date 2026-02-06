# Record Player Discord Bot

A Discord bot that streams audio from your computer's audio input (e.g., a record player, mixer, or other audio source) into a Discord voice channel, with album artwork and info features.

## Features

- **Audio Device Selection:** On startup, the bot lists all available audio input devices and lets you choose which one to stream from.
- **Stream Audio to Discord:** Joins a voice channel and streams live audio from your selected input device.
- **Album Info & Artwork:** Use `!spin <artist> - <album>` to announce what's playing. The bot fetches album artwork from iTunes and displays it in the channel.
- **Dynamic Bot Activity:** The bot's Discord status updates to show the current record being spun.
- **Auto-Disconnect:** The bot automatically disconnects after 15 seconds of audio inactivity.

## Commands

| Command | Description |
|---------|-------------|
| `!spin` | Joins your voice channel and starts streaming audio |
| `!spin <search>` | Joins, streams, and displays album info/artwork (searches iTunes) |
| `!nospin` | Stops streaming and disconnects from the voice channel |
| `!buttcheese` | A fun easter egg command |

## Requirements

- **Node.js** v16 or higher
- **FFmpeg** installed and available in your system PATH
- A **Discord bot token**
- An audio input device (line-in, USB audio interface, etc.)

## Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/jarekjar/record-player-bot
   cd record-player-bot
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env` file in the root directory with the following variables:
   ```
   DISCORD_TOKEN=your_discord_bot_token_here
   APPLICATION_ID=your_application_id_here
   PUBLIC_KEY=your_public_key_here
   ```

   You can find these values in the [Discord Developer Portal](https://discord.com/developers/applications):
   - **DISCORD_TOKEN** - Bot → Token (click "Reset Token" if you don't have one)
   - **APPLICATION_ID** - General Information → Application ID
   - **PUBLIC_KEY** - General Information → Public Key

4. **Run the bot:**
   ```bash
   npm run start
   ```

5. **Select your audio device:**
   When the bot starts, you'll see a list of available audio devices:
   ```
   🎵 Available Audio Devices:

     1. Microphone (Realtek High Definition Audio)
     2. Line In (USB Audio Device)
     3. Loopback (Audio Interface)

   Select audio device number for your record player: 2

   ✅ Selected: Line In (USB Audio Device)

   🔌 Connecting to Discord...
   ```

## Usage

1. Join a voice channel in your Discord server
2. Type `!spin` to have the bot join and start streaming
3. Optionally include album info: `!spin The Beatles - Abbey Road`
4. Type `!nospin` when you're done

## Notes

- This bot is designed for **Windows** and uses DirectShow for audio capture.
- Make sure your audio source is connected and the input levels are set correctly.
- The bot uses the iTunes Search API for album artwork (no API key required).

---

Enjoy spinning records with your Discord community! 