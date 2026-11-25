import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { processAudioSticker } from '../src/plugins/audio-sticker/processor.js';

function ffmpeg(args) {
  const result = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'ffmpeg fixture generation failed');
}

test('video input creates animated WebP and extracts original audio', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aurex-video-'));
  try {
    const input = path.join(root, 'source.mp4');
    ffmpeg(['-f', 'lavfi', '-i', 'color=c=red:s=160x120:d=1', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', input]);
    const result = await processAudioSticker({
      visualBuffer: await fs.readFile(input),
      visualKind: 'video',
      audioBuffer: null,
      workDir: path.join(root, 'out')
    });
    assert.ok(result.stickerBytes > 0);
    assert.ok(result.audioBytes > 0);
    assert.match(result.stickerPath, /\.webp$/);
    assert.match(result.audioPath, /\.ogg$/);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('image plus custom audio creates WebP and Opus audio', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aurex-image-'));
  try {
    const image = path.join(root, 'source.png');
    const audio = path.join(root, 'voice.wav');
    ffmpeg(['-f', 'lavfi', '-i', 'color=c=blue:s=128x128:d=1', '-frames:v', '1', image]);
    ffmpeg(['-f', 'lavfi', '-i', 'sine=frequency=880:duration=1', '-c:a', 'pcm_s16le', audio]);
    const result = await processAudioSticker({
      visualBuffer: await fs.readFile(image),
      visualKind: 'image',
      audioBuffer: await fs.readFile(audio),
      workDir: path.join(root, 'out')
    });
    assert.ok(result.stickerBytes > 0);
    assert.ok(result.audioBytes > 0);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
