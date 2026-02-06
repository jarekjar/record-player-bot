require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const { spawn, execSync } = require('child_process');
const https = require('https');
const readline = require('readline');

// Store the selected audio device
let selectedAudioDevice = null;

// Function to list available audio devices using ffmpeg
function listAudioDevices() {
    return new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', [
            '-list_devices', 'true',
            '-f', 'dshow',
            '-i', 'dummy'
        ], { shell: true });

        let output = '';
        ffmpeg.stderr.on('data', (data) => {
            output += data.toString();
        });

        ffmpeg.on('error', (err) => {
            console.log('❌ Error running ffmpeg:', err.message);
            console.log('Make sure ffmpeg is installed and in your PATH.');
            resolve([]);
        });

        ffmpeg.on('close', () => {
            // Parse audio devices from ffmpeg output
            // Format: [dshow @ addr] "Device Name" (audio)
            const devices = [];
            const lines = output.split(/\r?\n/);

            for (const line of lines) {
                // Match lines that end with (audio) and contain a quoted device name
                if (line.includes('(audio)') && !line.toLowerCase().includes('alternative name')) {
                    const match = line.match(/"([^"]+)"/);
                    if (match) {
                        devices.push(match[1]);
                    }
                }
            }
            
            resolve(devices);
        });
    });
}

// Function to prompt user to select an audio device
async function selectAudioDevice() {
    const devices = await listAudioDevices();
    
    if (devices.length === 0) {
        console.log('\n❌ No audio devices found! Make sure ffmpeg is installed and audio devices are connected.');
        process.exit(1);
    }

    console.log('\n🎵 Available Audio Devices:\n');
    devices.forEach((device, index) => {
        console.log(`  ${index + 1}. ${device}`);
    });
    console.log();

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) => {
        rl.question('Select audio device number for your record player: ', (answer) => {
            rl.close();
            const index = parseInt(answer) - 1;
            if (index >= 0 && index < devices.length) {
                selectedAudioDevice = devices[index];
                console.log(`\n✅ Selected: ${selectedAudioDevice}\n`);
                resolve(selectedAudioDevice);
            } else {
                console.log('\n❌ Invalid selection. Using first device.');
                selectedAudioDevice = devices[0];
                console.log(`\n✅ Selected: ${selectedAudioDevice}\n`);
                resolve(selectedAudioDevice);
            }
        });
    });
}

// Create a new client instance
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

// Create audio player
const player = createAudioPlayer();

// Store the current voice connection globally
let currentConnection = null;
// Store the inactivity timeout
let inactivityTimeout = null;

// Function to create a stream from line-in input
function createLineInStream() {
    // Use ffmpeg to capture audio from line-in
    const ffmpeg = spawn('ffmpeg', [
        '-f', 'dshow',           // Use DirectShow for Windows
        '-i', `audio=${selectedAudioDevice}`,   // Use selected audio device
        '-f', 's16le',           // Output format: signed 16-bit little-endian
        '-ar', '48000',          // Sample rate: 48kHz
        '-ac', '2',              // 2 channels (stereo)
        'pipe:1'                 // Output to pipe
    ]);

    return ffmpeg.stdout;
}

// Function to find the first text channel named 'music'
function getMusicChannel(guild) {
    return guild.channels.cache.find(
        ch => ch.type === 0 && ch.name.toLowerCase() === 'music'
    );
}

// Function to fetch album artwork and info from iTunes
async function fetchAlbumInfo(query) {
    return new Promise((resolve, reject) => {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=album&limit=1`;
        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    if (json.resultCount > 0) {
                        const result = json.results[0];
                        resolve({
                            artist: result.artistName,
                            album: result.collectionName,
                            artwork: result.artworkUrl100.replace('100x100', '600x600')
                        });
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    reject(e);
                }
            });
        }).on('error', reject);
    });
}

// When the client is ready, run this code (only once)
client.once(Events.ClientReady, readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    // Set the bot's activity
    readyClient.user.setActivity('Spinning a record', { type: 'PLAYING' });
});

// Listen for messages
client.on(Events.MessageCreate, async message => {
    // Ignore messages from bots
    if (message.author.bot) return;

    // Simple ping command
    if (message.content.toLowerCase() === '!buttcheese') {
        await message.reply('Buttcheese is the best. Andy is stinky.');
    }

    // Spin command
    if (message.content.toLowerCase().startsWith('!spin')) {
        // Check if user is in a voice channel
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.reply('You need to be in a voice channel first!');
        }

        // Parse extra text after !spin
        const args = message.content.slice(5).trim();
        let albumReply = null;
        if (args.length > 0) {
            // Try to fetch album info and artwork
            const albumInfo = await fetchAlbumInfo(args);
            if (albumInfo) {
                albumReply = {
                    content: `🎶 **Now Spinning:** ${albumInfo.artist} — ${albumInfo.album}`,
                    files: [albumInfo.artwork]
                };
                // Update bot activity to show the record name
                client.user.setActivity(`Spinning - ${albumInfo.artist} — ${albumInfo.album}`, { type: 'PLAYING' });
            } else {
                albumReply = { content: `🎶 **Now Spinning:** ${args}\n(Artwork not found)` };
                client.user.setActivity(`Spinning - ${args}`, { type: 'PLAYING' });
            }
        } else {
            // Default activity if no record name is provided
            client.user.setActivity('Spinning a record', { type: 'PLAYING' });
        }

        try {
            // Join the voice channel
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
            });

            // Store the connection globally
            currentConnection = connection;

            // Subscribe the connection to the player
            connection.subscribe(player);

            // Notify that we're joining
            const botVoiceState = message.guild.members.me.voice;
            if (!botVoiceState.channel || botVoiceState.channel.id !== voiceChannel.id) {
                await message.reply('🎵 Joining the voice channel to spin a record!');
            }

            // Reply with album info and artwork if provided
            if (albumReply) {
                await message.reply(albumReply);
            }

            // Create a stream from line-in input
            const lineInStream = createLineInStream();
            
            // Create an audio resource from the line-in stream
            const resource = createAudioResource(lineInStream, {
                inputType: 'raw',
                inlineVolume: true
            });

            // Play the audio
            player.play(resource);

            // Handle when the audio finishes playing
            player.on(AudioPlayerStatus.Idle, () => {
                // Start a 5-minute inactivity timer
                if (inactivityTimeout) clearTimeout(inactivityTimeout);
                inactivityTimeout = setTimeout(() => {
                    if (currentConnection) {
                        currentConnection.destroy();
                        currentConnection = null;
                    }
                }, 15 * 1000); // 15 seconds
            });

            // Clear the inactivity timer if playback resumes
            player.on(AudioPlayerStatus.Playing, () => {
                if (inactivityTimeout) {
                    clearTimeout(inactivityTimeout);
                    inactivityTimeout = null;
                }
            });

        } catch (error) {
            console.error(error);
            message.reply('There was an error trying to play audio from line-in!');
        }
    }

    // !nospin command to disconnect the bot
    if (message.content.toLowerCase() === '!nospin') {
        if (currentConnection) {
            currentConnection.destroy();
            currentConnection = null;
            await message.reply('🛑 Stopped spinning and left the voice channel.');
        } else {
            await message.reply('I am not in a voice channel!');
        }
    }
});

// Start the bot - first select audio device, then log in to Discord
async function start() {
    await selectAudioDevice();
    console.log('🔌 Connecting to Discord...\n');
    client.login(process.env.DISCORD_TOKEN);
}

start(); 