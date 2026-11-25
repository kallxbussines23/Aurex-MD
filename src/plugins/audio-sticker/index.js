import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../core/config.js';
import { downloadMessageMedia, getMediaKind, getQuotedMessage } from '../../core/media.js';
import { processAudioSticker } from './processor.js';
import { sendEmbeddedAudioSticker } from './transport.js';

const pluginName = 'audio-sticker';
const prompt = '🎵 *AUREX-MD Audio Sticker*\n\nPilih sumber audio:\n• Ketik .default untuk audio asli video\n• Ketik .custom untuk VN/file audio kustom\n\nBalas command ini jika ingin membatalkan: .cancel';

function sessionKey(jid, sender) {
  return `${jid}:${sender || jid}`;
}

export default {
  name: pluginName,
  version: '1.0.0',
  async register(api) {
    const { commands, sessions, logger } = api;

    commands.register('sa', async ({ sock, message, jid, sender }) => {
      const quoted = getQuotedMessage(message);
      if (!quoted) {
        await sock.sendMessage(jid, { text: 'Reply gambar atau video dengan .sa.' }, { quoted: message });
        return;
      }
      const kind = getMediaKind(quoted.message);
      if (!['image', 'video'].includes(kind)) {
        await sock.sendMessage(jid, { text: 'Media yang direply harus berupa gambar atau video.' }, { quoted: message });
        return;
      }
      const key = sessionKey(jid, sender);
      const old = sessions.get(key);
      if (old?.workDir) await fs.rm(old.workDir, { recursive: true, force: true });
      const workDir = path.join(config.tempDir, 'audio-sticker', Buffer.from(key).toString('base64url'));
      await fs.mkdir(workDir, { recursive: true });
      const visualBuffer = await downloadMessageMedia(quoted, logger, config.maxMediaBytes);
      const session = { kind, visualBuffer, quoted, workDir, stage: kind === 'video' ? 'choose-audio' : 'await-audio' };
      sessions.set(key, session, () => fs.rm(workDir, { recursive: true, force: true }));
      const text = kind === 'video' ? prompt : '🎵 Kirim VN atau file audio untuk dipasangkan dengan gambar. Ketik .cancel untuk membatalkan.';
      await sock.sendMessage(jid, { text }, { quoted: message });
    });

    commands.register('default', async ({ sock, message, jid, sender }) => {
      const key = sessionKey(jid, sender);
      const session = sessions.get(key);
      if (!session || session.kind !== 'video' || session.stage !== 'choose-audio') {
        await sock.sendMessage(jid, { text: 'Tidak ada sesi video yang sedang menunggu pilihan audio.' }, { quoted: message });
        return;
      }
      await createSticker({ sock, jid, message, session, sessions, key, logger, audioBuffer: null });
    });

    commands.register('custom', async ({ sock, message, jid, sender }) => {
      const key = sessionKey(jid, sender);
      const session = sessions.get(key);
      if (!session || session.kind !== 'video' || session.stage !== 'choose-audio') {
        await sock.sendMessage(jid, { text: 'Gunakan .sa pada video terlebih dahulu sebelum memilih .custom.' }, { quoted: message });
        return;
      }
      session.stage = 'await-audio';
      sessions.set(key, session, () => fs.rm(session.workDir, { recursive: true, force: true }));
      await sock.sendMessage(jid, { text: 'Silakan kirim VN atau file audio. Ketik .cancel untuk membatalkan.' }, { quoted: message });
    });

    commands.register('cancel', async ({ sock, message, jid, sender }) => {
      const key = sessionKey(jid, sender);
      const session = sessions.get(key);
      if (!session) {
        await sock.sendMessage(jid, { text: 'Tidak ada sesi Audio Sticker aktif.' }, { quoted: message });
        return;
      }
      sessions.delete(key);
      await fs.rm(session.workDir, { recursive: true, force: true });
      await sock.sendMessage(jid, { text: 'Proses Audio Sticker dibatalkan.' }, { quoted: message });
    });

    api.onMessage(async ({ sock, message, jid, sender }) => {
      const key = sessionKey(jid, sender);
      const session = sessions.get(key);
      if (!session || session.stage !== 'await-audio') return false;
      const kind = getMediaKind(message.message);
      if (kind !== 'audio') return false;
      const audioBuffer = await downloadMessageMedia(message, logger, config.maxMediaBytes);
      await createSticker({ sock, jid, message, session, sessions, key, logger, audioBuffer });
      return true;
    });
  }
};

async function createSticker({ sock, jid, message, session, sessions, key, logger, audioBuffer }) {
  let keepSession = false;
  try {
    await sock.sendMessage(jid, { text: '⏳ Memproses media Audio Sticker...' }, { quoted: message });
    const result = await processAudioSticker({
      visualBuffer: session.visualBuffer,
      visualKind: session.kind,
      audioBuffer,
      workDir: session.workDir
    });
    await sendEmbeddedAudioSticker({
      sock, jid,
      stickerPath: result.stickerPath,
      audioPath: result.audioPath,
      quoted: message
    });
    await sock.sendMessage(jid, { text: '✅ Audio Sticker berhasil dibuat.' }, { quoted: message });
  } catch (error) {
    if (error.code === 'NO_AUDIO_STREAM' && session.kind === 'video') {
      keepSession = true;
      session.stage = 'choose-audio';
      sessions.set(key, session, () => fs.rm(session.workDir, { recursive: true, force: true }));
      await sock.sendMessage(jid, { text: 'Video ini tidak memiliki audio bawaan. Ketik .custom lalu kirim VN atau file audio.' }, { quoted: message });
    } else {
      logger.error({ err: error }, 'Audio Sticker failed');
      await sock.sendMessage(jid, { text: `❌ Gagal membuat Audio Sticker: ${error.message}` }, { quoted: message });
    }
  } finally {
    if (!keepSession) {
      sessions.delete(key);
      await fs.rm(session.workDir, { recursive: true, force: true });
    }
  }
}
