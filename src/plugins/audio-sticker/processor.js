import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`FFmpeg exited ${code}: ${stderr.slice(-1200)}`)));
  });
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

    if (visualKind === 'video') {
      await run('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y', '-i', visualInput,
        '-an', '-t', '7', '-vf',
        'fps=12,scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
        '-loop', '0', '-c:v', 'libwebp_anim', '-lossless', '0', '-q:v', '65',
        '-compression_level', '4', stickerPath
      ]);
      if (!audioBuffer) {
        await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', visualInput, '-vn', '-t', '7', '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '64k', audioPath]);
      }
    } else if (visualKind === 'image') {
      await run('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-y', '-i', visualInput,
        '-frames:v', '1', '-vf',
        'scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=0x00000000',
        '-c:v', 'libwebp', '-lossless', '0', '-q:v', '80', stickerPath
      ]);
    } else {
      throw new Error('Unsupported visual media type');
    }

    if (audioBuffer) {
      await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', audioInput, '-vn', '-t', '7', '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '64k', audioPath]);
    }

    const [sticker, audio] = await Promise.all([
      fs.readFile(stickerPath),
      fs.readFile(audioPath)
    ]);
    if (sticker.length > 500 * 1024) throw new Error('Animated sticker exceeds 500 KB; try a shorter/simpler video');
    return { stickerPath, audioPath, stickerBytes: sticker.length, audioBytes: audio.length };
  } catch (error) {
    await Promise.all([fs.rm(stickerPath, { force: true }), fs.rm(audioPath, { force: true })]);
    throw error;
  } finally {
    await Promise.all([fs.rm(visualInput, { force: true }), fs.rm(audioInput, { force: true })]);
  }
}
