import fs from 'node:fs/promises';
import {
  generateWAMessageFromContent,
  prepareWAMessageMedia,
  proto
} from '@whiskeysockets/baileys';
import {
  attachAudioToSticker,
  detachAudioFromSticker,
  installAudioStickerEncoder,
  readEmbeddedAudioSticker
} from './encoder-patch.js';

const AUDIO_MIMETYPE = 'audio/ogg; codecs=opus';
installAudioStickerEncoder(proto);

export async function sendEmbeddedAudioSticker({ sock, jid, stickerPath, audioPath, quoted, seconds, isAnimated }) {
  if (!sock?.waUploadToServer || !sock?.relayMessage) {
    throw new Error('Baileys socket does not expose the required media upload methods');
  }

  const [audioBuffer, stickerBuffer] = await Promise.all([
    fs.readFile(audioPath),
    fs.readFile(stickerPath)
  ]);
  const uploadOptions = { upload: sock.waUploadToServer };
  const [uploadedAudio, uploadedSticker] = await Promise.all([
    prepareWAMessageMedia({ audio: audioBuffer, mimetype: AUDIO_MIMETYPE, seconds }, uploadOptions),
    prepareWAMessageMedia({ sticker: stickerBuffer, isAnimated }, uploadOptions)
  ]);

  const audio = uploadedAudio.audioMessage;
  const sticker = uploadedSticker.stickerMessage;
  if (!audio?.fileSha256 || !sticker?.fileSha256) {
    throw new Error('WhatsApp media upload did not return the required sticker/audio metadata');
  }

  const audioMessage = proto.Message.AudioMessage.create({
    url: audio.url,
    mimetype: AUDIO_MIMETYPE,
    fileSha256: audio.fileSha256,
    fileLength: audio.fileLength,
    seconds,
    ptt: true,
    mediaKey: audio.mediaKey,
    fileEncSha256: audio.fileEncSha256,
    directPath: audio.directPath,
    mediaKeyTimestamp: audio.mediaKeyTimestamp || Math.floor(Date.now() / 1000)
  });
  const encodedAudio = proto.Message.AudioMessage.encode(audioMessage).finish();

  sticker.isAnimated = Boolean(isAnimated);
  sticker.width = 512;
  sticker.height = 512;
  attachAudioToSticker(sticker.fileSha256, encodedAudio);

  try {
    const outgoing = generateWAMessageFromContent(
      jid,
      { stickerMessage: sticker },
      { quoted, userJid: sock.user?.id }
    );
    const encodedMessage = proto.Message.encode(outgoing.message).finish();
    const embeddedAudio = readEmbeddedAudioSticker(encodedMessage);
    if (!embeddedAudio || !Buffer.from(embeddedAudio).equals(Buffer.from(encodedAudio))) {
      throw new Error('Audio Sticker validation failed: embedded AudioMessage field was not found');
    }
    await sock.relayMessage(jid, outgoing.message, { messageId: outgoing.key.id });
    return { sticker, audio, messageId: outgoing.key.id };
  } finally {
    detachAudioFromSticker(sticker.fileSha256);
  }
}
