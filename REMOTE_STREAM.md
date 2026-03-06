# Remote Stream Setup (Line-in → Deployed Bot)

Stream your PC's line-in to a Discord bot running on Railway.

## 1. Deploy the bot to Railway

1. Push this repo to GitHub
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Select this repo
4. Add **Variables**:
   - `DISCORD_TOKEN` – your bot token
   - `USE_REMOTE_STREAM` – `true`
   - `STREAM_SECRET` – (optional) a secret string to prevent unauthorized streaming
5. Deploy. Railway will give you a URL like `https://record-player-production-xxxx.up.railway.app`
6. The WebSocket endpoint is: `wss://record-player-production-xxxx.up.railway.app/audio`

## 2. Configure the relay (your PC)

Add to `.env`:

```
BOT_WS_URL=wss://your-app.up.railway.app/audio
STREAM_SECRET=your-secret   # optional, must match the bot's STREAM_SECRET
```

## 3. Usage

1. **In Discord**: Join a voice channel, run `!spin` (optionally with album name)
2. Bot joins and replies: "Waiting for stream... Run the relay on your PC"
3. **On your PC**: `node scripts/relay.js`
4. Select your line-in device when prompted
5. Audio streams to the bot and plays in Discord
6. Press Ctrl+C to stop the relay, or use `!nospin` in Discord

## Requirements

- **PC**: Node.js, ffmpeg, line-in device
- **Railway**: Free tier works; bot needs to stay running
