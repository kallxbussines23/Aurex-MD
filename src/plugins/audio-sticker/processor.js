import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

function run(command, args, capture = false) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', capture ? 'pipe' : 'ignore', 'pipe'] });
    let stdout = '';
    let stderr = '';
    if (capture) child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('close', code => {
      if (code === 0) return resolve(capture ? stdout.trim() : undefined);
      const error = new Error(`${command} exited ${code}: ${stderr.slice(-1200)}`);
      if (/does not contain any stream|matches no streams|no audio stream/i.test(stderr)) error.code = 'NO_AUDIO_STREAM';
      reject(error);
    });
  });
}

async function durationOf(filePath) {
  const value = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', filePath
  ], true);
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) throw new Error('Could not read media duration');
  return seconds;
}

export async function processAudioSticker({ visualBuffer, visualKind, audioBuffer, workDir }) {
  await fs.mkdir(workDir, { recursive: true });
  const id = crypto.randomUUID();
  const visualInput = path.join(workDir, `${id}-visual`);
  const audioInput = path.join(workDir, `${id}-audio`);
  const stickerPath = path.join(workDir, `${id}.webp`);
  const audioPath = path.join(workDir, `${id}.ogg`);

  try {
    await fs.writeFile(visualInput, visualBuffer);
    if (audioBuffer) await fs.writeFile(audioInput, audioBuffer);

    let duration;
    if (visualKind === 'video') {
      const visualDuration = await durationOf(visualInput);
      const audioDuration = audioBuffer ? await durationOf(audioInput) : visualDuration;
      duration = Math.min(7, visualDuration, audioDuration);
      if (duration < 0.1) throw new Error('Media duration is too short');

      await run('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y', '-i', visualInput,
        '-an', '-t', String(duration), '-vf',
        'fps=12,scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
        '-loop', '0', '-c:v', 'libwebp_anim', '-lossless', '0', '-q:v', '65',
        '-compression_level', '4', stickerPath
      ]);

      const audioSource = audioBuffer ? audioInput : visualInput;
      await run('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y', '-i', audioSource,
        '-vn', '-t', String(duration), '-ac', '1', '-ar', '48000',
        '-c:a', 'libopus', '-b:a', '64k', audioPath
      ]);
    } else if (visualKind === 'image') {
      if (!audioBuffer) throw new Error('An image requires a custom audio file');
      duration = Math.min(7, await durationOf(audioInput));
      if (duration < 0.1) throw new Error('Audio duration is too short');

      await run('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y', '-i', visualInput,
        '-frames:v', '1', '-vf',
        'scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
        '-c:v', 'libwebp', '-lossless', '0', '-q:v', '80', stickerPath
      ]);
      await run('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y', '-i', audioInput,
        '-vn', '-t', String(duration), '-ac', '1', '-ar', '48000',
        '-c:a', 'libopus', '-b:a', '64k', audioPath
      ]);
    } else {
      throw new Error('Unsupported visual media type');
    }

    const [sticker, audio] = await Promise.all([
      fs.readFile(stickerPath),
      fs.readFile(audioPath)
    ]);
    if (sticker.length > 500 * 1024) throw new Error('Sticker exceeds 500 KB; try a shorter or simpler video');
    return {
      stickerPath,
      audioPath,
      stickerBytes: sticker.length,
      audioBytes: audio.length,
      seconds: Math.max(1, Math.ceil(duration)),
      isAnimated: visualKind === 'video'
    };
  } catch (error) {
    await Promise.all([fs.rm(stickerPath, { force: true }), fs.rm(audioPath, { force: true })]);
    throw error;
  } finally {
    await Promise.all([fs.rm(visualInput, { force: true }), fs.rm(audioInput, { force: true })]);
  }
}
