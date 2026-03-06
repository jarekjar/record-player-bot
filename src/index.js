require('dotenv').config();
const { Client, GatewayIntentBits, Events } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const { spawn } = require('child_process');
const https = require('https');
const http = require('http');
const readline = require('readline');
const { PassThrough } = require('stream');
const { WebSocketServer } = require('ws');

const USE_REMOTE_STREAM = process.env.USE_REMOTE_STREAM === 'true';
const STREAM_SECRET = process.env.STREAM_SECRET || '';

// Store the selected audio device (local mode only)
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
            const devices = [];
            const lines = output.split(/\r?\n/);
            for (const line of lines) {
                if (line.includes('(audio)') && !line.toLowerCase().includes('alternative name')) {
                    const match = line.match(/"([^"]+)"/);
                    if (match) devices.push(match[1]);
                }
            }
            resolve(devices);
        });
    });
}

async function selectAudioDevice() {
    const devices = await listAudioDevices();
    if (devices.length === 0) {
        console.log('\n❌ No audio devices found!');
        process.exit(1);
    }
    console.log('\n🎵 Available Audio Devices:\n');
    devices.forEach((d, i) => console.log(`  ${i + 1}. ${d}`));
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question('Select audio device number: ', (answer) => {
            rl.close();
            const i = parseInt(answer) - 1;
            selectedAudioDevice = (i >= 0 && i < devices.length) ? devices[i] : devices[0];
            console.log(`\n✅ Selected: ${selectedAudioDevice}\n`);
            resolve(selectedAudioDevice);
        });
    });
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ]
});

const player = createAudioPlayer();
let currentConnection = null;
let inactivityTimeout = null;

// Remote stream state
let awaitingStream = false;
let audioStream = null;
let streamWs = null;
let waitingStreamMessage = null;

function createLineInStream() {
    return spawn('ffmpeg', [
        '-f', 'dshow', '-i', `audio=${selectedAudioDevice}`,
        '-f', 's16le', '-ar', '48000', '-ac', '2',
        'pipe:1'
    ], { stdio: ['ignore', 'pipe', 'ignore'] }).stdout;
}

function getMusicChannel(guild) {
    return guild.channels.cache.find(ch => ch.type === 0 && ch.name.toLowerCase() === 'music');
}

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
                        const r = json.results[0];
                        resolve({
                            artist: r.artistName,
                            album: r.collectionName,
                            artwork: r.artworkUrl100.replace('100x100', '600x600')
                        });
                    } else resolve(null);
                } catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

client.once(Events.ClientReady, (readyClient) => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    readyClient.user.setActivity('Spinning a record', { type: 'PLAYING' });
});

client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot) return;

    if (message.content.toLowerCase() === '!buttcheese') {
        await message.reply('Buttcheese is the best. Andy is stinky.');
    }

    if (message.content.toLowerCase().startsWith('!spin')) {
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            return message.reply('You need to be in a voice channel first!');
        }

        const args = message.content.slice(5).trim();
        let albumReply = null;
        if (args.length > 0) {
            const albumInfo = await fetchAlbumInfo(args);
            if (albumInfo) {
                albumReply = {
                    content: `🎶 **Now Spinning:** ${albumInfo.artist} — ${albumInfo.album}`,
                    files: [albumInfo.artwork]
                };
                client.user.setActivity(`Spinning - ${albumInfo.artist} — ${albumInfo.album}`, { type: 'PLAYING' });
            } else {
                albumReply = { content: `🎶 **Now Spinning:** ${args}\n(Artwork not found)` };
                client.user.setActivity(`${args}`, { type: 'PLAYING' });
            }
        } else {
            client.user.setActivity('Spinning a record', { type: 'PLAYING' });
        }

        try {
            const connection = joinVoiceChannel({
                channelId: voiceChannel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator,
            });
            currentConnection = connection;
            connection.subscribe(player);

            if (!message.guild.members.me.voice.channel || message.guild.members.me.voice.channel.id !== voiceChannel.id) {
                await message.reply('🎵 Joining the voice channel to spin a record!');
            }
            if (albumReply) await message.reply(albumReply);

            if (USE_REMOTE_STREAM) {
                awaitingStream = true;
                audioStream = new PassThrough();
                waitingStreamMessage = await message.reply('⏳ **Waiting for stream...** Run the relay on your PC: `node scripts/relay.js`');
                // Play will start when relay connects (handled in WebSocket handler)
            } else {
                const lineInStream = createLineInStream();
                const resource = createAudioResource(lineInStream, { inputType: 'raw', inlineVolume: true });
                player.play(resource);
            }

            player.on(AudioPlayerStatus.Idle, () => {
                if (inactivityTimeout) clearTimeout(inactivityTimeout);
                inactivityTimeout = setTimeout(() => {
                    if (currentConnection) {
                        currentConnection.destroy();
                        currentConnection = null;
                    }
                }, 15 * 1000);
            });
            player.on(AudioPlayerStatus.Playing, () => {
                if (inactivityTimeout) {
                    clearTimeout(inactivityTimeout);
                    inactivityTimeout = null;
                }
            });
        } catch (error) {
            console.error(error);
            message.reply('There was an error trying to play audio!');
        }
    }

    if (message.content.toLowerCase() === '!nospin') {
        if (currentConnection) {
            if (streamWs) {
                streamWs.close();
                streamWs = null;
            }
            currentConnection.destroy();
            currentConnection = null;
            awaitingStream = false;
            audioStream = null;
            await message.reply('🛑 Stopped spinning and left the voice channel.');
        } else {
            await message.reply('I am not in a voice channel!');
        }
    }
});

async function start() {
    if (USE_REMOTE_STREAM) {
        const port = parseInt(process.env.PORT, 10) || 3000;
        const server = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/plain' });
            res.end('Record player bot - WebSocket on /audio');
        });
        const wss = new WebSocketServer({ server, path: '/audio' });

        wss.on('connection', (ws, req) => {
            if (!awaitingStream || !audioStream) {
                ws.close(1008, 'Not awaiting stream');
                return;
            }
            if (STREAM_SECRET) {
                ws.once('message', (msg) => {
                    try {
                        const data = JSON.parse(msg.toString());
                        if (data.secret !== STREAM_SECRET) {
                            ws.close(1008, 'Invalid secret');
                            return;
                        }
                    } catch {
                        ws.close(1008, 'Invalid auth');
                        return;
                    }
                    startStreaming(ws);
                });
            } else {
                startStreaming(ws);
            }
        });

        function startStreaming(ws) {
            streamWs = ws;
            const resource = createAudioResource(audioStream, { inputType: 'raw', inlineVolume: true });
            resource.volume?.setVolume(2);
            player.play(resource);
            awaitingStream = false;
            waitingStreamMessage?.edit('🔴 **Streaming!**').catch(() => {});
            waitingStreamMessage = null;

            let chunkCount = 0;
            ws.on('message', (data) => {
                if (!audioStream || audioStream.destroyed) return;
                const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data);
                if (chunk.length > 0) {
                    audioStream.write(chunk);
                    if (++chunkCount === 1) console.log('[Stream] Receiving audio');
                }
            });
            ws.on('close', () => {
                streamWs = null;
                if (audioStream && !audioStream.destroyed) audioStream.end();
            });
            ws.on('error', () => {
                if (audioStream && !audioStream.destroyed) audioStream.destroy();
            });
        }

        server.listen(port, () => {
            console.log(`WebSocket server on port ${port} (path: /audio)`);
        });
    } else {
        await selectAudioDevice();
    }

    console.log('🔌 Connecting to Discord...\n');
    client.login(process.env.DISCORD_TOKEN);
}

start();
