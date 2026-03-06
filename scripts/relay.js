/**
 * Local relay: captures line-in and streams to the deployed bot via WebSocket.
 *
 * 1. Deploy the bot to Railway with USE_REMOTE_STREAM=true
 * 2. Set in .env:
 *    BOT_WS_URL=wss://your-app.up.railway.app/audio
 *    STREAM_SECRET=your-secret  (optional, must match bot's STREAM_SECRET)
 * 3. Run !spin in Discord (bot joins voice, waits for stream)
 * 4. Run: node scripts/relay.js
 */

require('dotenv').config();
const { spawn } = require('child_process');
const WebSocket = require('ws');
const readline = require('readline');

const BOT_WS_URL = process.env.BOT_WS_URL;
const STREAM_SECRET = process.env.STREAM_SECRET || '';

if (!BOT_WS_URL) {
    console.log('Set BOT_WS_URL in .env (e.g. wss://your-app.up.railway.app/audio)');
    process.exit(1);
}

async function listAudioDevices() {
    return new Promise((resolve) => {
        const ffmpeg = spawn('ffmpeg', [
            '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'
        ], { shell: true });
        let output = '';
        ffmpeg.stderr.on('data', (d) => { output += d.toString(); });
        ffmpeg.on('close', () => {
            const devices = [];
            output.split(/\r?\n/).forEach((line) => {
                if (line.includes('(audio)') && !line.toLowerCase().includes('alternative name')) {
                    const m = line.match(/"([^"]+)"/);
                    if (m) devices.push(m[1]);
                }
            });
            resolve(devices);
        });
    });
}

async function selectDevice() {
    const devices = await listAudioDevices();
    if (devices.length === 0) {
        console.log('No audio devices found.');
        process.exit(1);
    }
    console.log('\n🎵 Audio devices:\n');
    devices.forEach((d, i) => console.log(`  ${i + 1}. ${d}`));
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
        rl.question('Select device number: ', (ans) => {
            rl.close();
            const i = parseInt(ans) - 1;
            resolve((i >= 0 && i < devices.length) ? devices[i] : devices[0]);
        });
    });
}

async function run() {
    const device = await selectDevice();
    console.log(`\n✅ Streaming from: ${device}`);
    console.log('Connecting to bot...\n');

    const ws = new WebSocket(BOT_WS_URL);

    ws.on('open', () => {
        if (STREAM_SECRET) {
            ws.send(JSON.stringify({ secret: STREAM_SECRET }));
        }
        const ffmpeg = spawn('ffmpeg', [
            '-f', 'dshow', '-i', `audio=${device}`,
            '-f', 's16le', '-ar', '48000', '-ac', '2',
            'pipe:1'
        ], { stdio: ['ignore', 'pipe', 'ignore'] });

        ffmpeg.stdout.on('data', (chunk) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(chunk);
        });

        ffmpeg.on('close', (code) => {
            if (code !== 0) console.log('ffmpeg exited:', code);
            ws.close();
        });

        process.on('SIGINT', () => {
            ffmpeg.kill();
            ws.close();
            process.exit(0);
        });

        console.log('🔴 Streaming... Press Ctrl+C to stop.');
    });

    ws.on('error', (err) => {
        console.error('WebSocket error:', err.message);
        process.exit(1);
    });

    ws.on('close', (code, reason) => {
        console.log('Disconnected:', code, reason?.toString() || '');
    });
}

run();
