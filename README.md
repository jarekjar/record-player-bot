# Discord Record Player Bot (Python)

Stream audio from your PC's line-in/record player to Discord voice channels. Choose your audio input device at startup, then use `!spin` to start streaming and `!nospin` to stop.

## Features

- **Audio device selection** — Pick your record player/line-in device at startup (Windows dshow via ffmpeg)
- **!spin** — Join your voice channel and stream audio from the selected device
- **!spin Artist - Album** — Same as above, plus fetches album artwork from the iTunes API and displays it
- **!nospin** — Stop streaming and leave the voice channel
- **!spin test** — Play a test URL to verify the bot works (no line-in needed)

## Requirements

- **Python 3.10+**
- **ffmpeg** — Must be installed and in your PATH ([download](https://ffmpeg.org/download.html))
- **Discord Bot Token** — Create a bot at [Discord Developer Portal](https://discord.com/developers/applications)

## Setup

1. **Create a virtual environment** (recommended):

   ```bash
   cd record-player-python
   python -m venv venv
   venv\Scripts\activate   # Windows
   # or: source venv/bin/activate  # macOS/Linux
   ```

2. **Install dependencies**:

   ```bash
   pip install -r requirements.txt
   ```

3. **Configure the bot**:

   - Copy `.env.example` to `.env`
   - Add your Discord bot token to `.env`:
     ```
     DISCORD_TOKEN=your_bot_token_here
     ```

4. **Enable Discord intents** (in Developer Portal → Bot):

   - Message Content Intent
   - Server Members Intent (if needed)

## Run

```bash
python bot.py
```

On startup, you'll be prompted to select an audio device. Choose the one connected to your record player (e.g. Line In, USB audio interface).

## Commands

| Command | Description |
|---------|-------------|
| `!spin` | Start streaming from your record player |
| `!spin Pink Floyd - Dark Side of the Moon` | Stream + show album artwork from iTunes |
| `!spin test` | Play a test MP3 from URL (no line-in) |
| `!nospin` | Stop streaming and leave the voice channel |

## Windows Notes

- Uses **DirectShow (dshow)** for audio capture — ensure your line-in is set as the default recording device or select it when prompted
- Check **Sound Settings → Recording** and ensure your Line In isn't muted and has adequate levels
