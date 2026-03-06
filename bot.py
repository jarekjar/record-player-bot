"""
Discord Record Player Bot - Stream audio from your PC's line-in/record player to Discord.
Commands: !spin [artist/album], !nospin
"""

import asyncio
import subprocess
import sys

import discord
from discord.ext import commands
from dotenv import load_dotenv
import requests

load_dotenv()

# Audio config: capture rate (device must support it). 48000 matches Discord natively.
DSHOW_SAMPLE_RATE = 48000

# Selected audio device (set at startup)
selected_device = None
selected_device_id = None

# Current voice connection and capture process
voice_client: discord.VoiceClient | None = None
capture_process: subprocess.Popen | None = None


def list_audio_devices() -> list[dict]:
    """List available audio input devices using ffmpeg (Windows dshow)."""
    try:
        result = subprocess.run(
            [
                "ffmpeg",
                "-list_devices", "true",
                "-f", "dshow",
                "-i", "dummy"
            ],
            capture_output=True,
            text=True,
            timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        output = result.stderr or result.stdout or ""
    except FileNotFoundError:
        print("❌ ffmpeg not found. Install ffmpeg and add it to your PATH.")
        return []
    except subprocess.TimeoutExpired:
        return []

    devices = []
    lines = output.splitlines()

    for i, line in enumerate(lines):
        if "(audio)" in line and "alternative name" not in line.lower():
            # Extract device name from "  "Device Name" (audio)"
            if '"' in line:
                start = line.index('"') + 1
                end = line.index('"', start)
                name = line[start:end]
                alt_name = None
                # Check next line for alternative name
                if i + 1 < len(lines) and "alternative name" in lines[i + 1].lower():
                    next_line = lines[i + 1]
                    if '"' in next_line:
                        a_start = next_line.index('"') + 1
                        a_end = next_line.index('"', a_start)
                        alt_name = next_line[a_start:a_end]
                devices.append({"name": name, "alt_name": alt_name or name})

    return devices


def select_audio_device() -> bool:
    """Prompt user to select an audio device. Returns True if successful."""
    global selected_device, selected_device_id

    devices = list_audio_devices()
    if not devices:
        print("\n❌ No audio devices found! Ensure ffmpeg is installed and devices are connected.")
        return False

    print("\n🎵 Available Audio Devices:\n")
    for i, dev in enumerate(devices, 1):
        print(f"  {i}. {dev['name']}")
    print()

    try:
        choice = input("Select audio device number for your record player: ").strip()
        idx = int(choice) - 1
        if 0 <= idx < len(devices):
            chosen = devices[idx]
        else:
            chosen = devices[0]
    except (ValueError, EOFError):
        chosen = devices[0]

    selected_device = chosen["name"]
    selected_device_id = chosen.get("alt_name") or chosen["name"]
    print(f"\n✅ Selected: {selected_device}\n")
    return True


def create_line_in_stream():
    """Create ffmpeg process that captures from selected device and outputs PCM to stdout."""
    global capture_process, selected_device_id

    device_id = selected_device_id or selected_device
    if not device_id:
        raise RuntimeError("No audio device selected")

    # Capture from dshow: force stereo at source; request 48kHz if device supports it
    # Output s16le 48kHz stereo (Discord's native format)
    capture_process = subprocess.Popen(
        [
            "ffmpeg",
            "-f", "dshow",
            "-channels", "2",
            "-sample_rate", str(DSHOW_SAMPLE_RATE),
            "-i", f"audio={device_id}",
            "-af", "volume=2",
            "-f", "s16le",
            "-ar", "48000",
            "-ac", "2",
            "-loglevel", "error",
            "pipe:1",
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
    )

    return capture_process.stdout


def fetch_album_info(query: str) -> dict | None:
    """Fetch album artwork and info from iTunes Search API."""
    if not query or not query.strip():
        return None
    try:
        url = "https://itunes.apple.com/search"
        params = {"term": query.strip(), "entity": "album", "limit": 1}
        resp = requests.get(url, params=params, timeout=5)
        resp.raise_for_status()
        data = resp.json()
        if data.get("resultCount", 0) > 0:
            r = data["results"][0]
            artwork = r.get("artworkUrl100", "").replace("100x100", "600x600")
            return {
                "artist": r.get("artistName", ""),
                "album": r.get("collectionName", ""),
                "artwork": artwork,
            }
    except Exception:
        pass
    return None


# Bot setup
intents = discord.Intents.default()
intents.message_content = True
intents.voice_states = True

bot = commands.Bot(command_prefix="!", intents=intents)


@bot.event
async def on_ready():
    print(f"Ready! Logged in as {bot.user}")
    await bot.change_presence(activity=discord.Activity(type=discord.ActivityType.playing, name="Spinning a record"))


@bot.command(name="spin")
async def spin(ctx, *, query: str = ""):
    """Start streaming audio from your record player. Optionally add artist/album for artwork: !spin Artist - Album"""
    global voice_client, capture_process

    if not ctx.author.voice or not ctx.author.voice.channel:
        await ctx.reply("You need to be in a voice channel first!")
        return

    channel = ctx.author.voice.channel

    # Fetch album info if query provided (iTunes API for artwork)
    album_reply = None
    if query and query.lower() != "test":
        album_info = fetch_album_info(query)
        if album_info:
            embed = discord.Embed(
                description=f"🎶 **Now Spinning:** {album_info['artist']} — {album_info['album']}",
                color=discord.Color.gold(),
            )
            embed.set_image(url=album_info["artwork"])
            album_reply = {"embed": embed}
            await bot.change_presence(
                activity=discord.Activity(
                    type=discord.ActivityType.playing,
                    name=f"Spinning - {album_info['artist']} — {album_info['album']}",
                )
            )
        else:
            album_reply = {"content": f"🎶 **Now Spinning:** {query}\n(Artwork not found)"}
            await bot.change_presence(
                activity=discord.Activity(type=discord.ActivityType.playing, name=f"Spinning - {query}")
            )
    else:
        await bot.change_presence(activity=discord.Activity(type=discord.ActivityType.playing, name="Spinning a record"))

    try:
        # Join or move to channel
        if ctx.voice_client:
            if ctx.voice_client.channel.id != channel.id:
                await ctx.voice_client.move_to(channel)
        else:
            voice_client = await channel.connect()

        # Stop any existing capture
        if capture_process:
            try:
                capture_process.terminate()
                capture_process.wait(timeout=2)
            except Exception:
                capture_process.kill()
            capture_process = None

        if query.lower() == "test":
            # Test mode: play a sample URL
            source = discord.FFmpegOpusAudio(
                "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
                method="fallback",
            )
            await ctx.reply("🔊 Playing test audio from URL.")
        else:
            # Stream from line-in: raw PCM 48kHz stereo -> PCMAudio (no double conversion)
            pcm_stream = create_line_in_stream()
            source = discord.PCMAudio(pcm_stream)

        ctx.voice_client.play(source, after=lambda e: _on_play_finished(e))

        if album_reply:
            await ctx.reply(**album_reply)
        elif not query or query.lower() != "test":
            await ctx.reply("🎵 Spinning! Audio from your record player is now streaming.")

    except Exception as e:
        print(f"Error in !spin: {e}")
        await ctx.reply("There was an error trying to stream audio from your record player!")


def _on_play_finished(error):
    """Called when audio playback finishes."""
    global capture_process
    if capture_process:
        try:
            capture_process.terminate()
            capture_process.wait(timeout=2)
        except Exception:
            capture_process.kill()
        capture_process = None
    if error:
        print(f"Playback error: {error}")


@bot.command(name="nospin")
async def nospin(ctx):
    """Stop streaming and leave the voice channel."""
    global voice_client, capture_process

    if ctx.voice_client:
        if capture_process:
            try:
                capture_process.terminate()
                capture_process.wait(timeout=2)
            except Exception:
                capture_process.kill()
            capture_process = None
        await ctx.voice_client.disconnect()
        voice_client = None
        await ctx.reply("🛑 Stopped spinning and left the voice channel.")
    else:
        await ctx.reply("I am not in a voice channel!")


@bot.command(name="andy")
async def andy(ctx):
    """Andy is a stinky boy."""
    await ctx.reply("andy is a stinky boy")


async def main():
    if not select_audio_device():
        sys.exit(1)

    token = __import__("os").getenv("DISCORD_TOKEN")
    if not token:
        print("❌ DISCORD_TOKEN not set in .env")
        sys.exit(1)

    async with bot:
        await bot.start(token)


if __name__ == "__main__":
    asyncio.run(main())
