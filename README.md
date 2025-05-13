# Record Player Discord Bot

A Discord bot that streams audio from your computer's line-in (e.g., a record player or other audio source) into a Discord voice channel, and provides music/album info features for your community.

## Features

- **Stream Line-In Audio:** Joins a voice channel and streams live audio from your computer's "Line In" device.
- **Now Spinning Album Info:** Use `!spin <artist> - <album>` to announce what record is playing. The bot fetches album artwork and info from iTunes and posts it in the channel.
- **Dynamic Bot Activity:** The bot's activity status updates to show the current record being spun.
- **Manual Album Announce:** Use `!album <album info>` to manually post album info to the #music channel.
- **Auto-Disconnect:** The bot will disconnect from the voice channel after 5 minutes of inactivity.
- **Fun Commands:** Includes a fun `!buttcheese` command.

## Commands

- `!spin [artist] - [album]` — Joins your voice channel, streams line-in audio, and posts album info/artwork.
- `!nospin` — Disconnects the bot from the voice channel.
- `!album <album info>` — Posts album info to the #music channel.
- `!buttcheese` — Replies with a fun message.

## Requirements

- Node.js (v16 or higher recommended)
- FFmpeg installed and available in your system PATH
- A Discord bot token
- A #music text channel in your server (for album info posts)

## Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/jarekjar/record-player-bot
   cd record-player
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Configure environment variables:**
   - Copy `.env.example` to `.env` and fill in your Discord bot token.
4. **Run the bot:**
   ```bash
   node src/index.js
   ```

## Notes
- Make sure your "Line In" device is enabled and receiving audio on your computer.
- The bot uses the iTunes API to fetch album artwork and info.
- The bot will only post album info/artwork if you provide it after `!spin`.

---

Enjoy spinning records with your Discord community! 