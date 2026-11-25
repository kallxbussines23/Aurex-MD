import { downloadMediaMessage, getContentType } from '@whiskeysockets/baileys';

export function unwrapMessage(message) {
  let current = message;
  while (current?.ephemeralMessage?.message || current?.viewOnceMessage?.message || current?.viewOnceMessageV2?.message) {
    current = current.ephemeralMessage?.message || current.viewOnceMessage?.message || current.viewOnceMessageV2?.message;
  }
  return current || {};
}

export function getMediaKind(message) {
  const content = unwrapMessage(message);
  const type = getContentType(content);
  if (type === 'imageMessage') return 'image';
  if (type === 'videoMessage') return 'video';
  if (type === 'audioMessage') return 'audio';
  return null;
}

export async function downloadMessageMedia(message, logger, maxBytes) {
  const buffer = await downloadMediaMessage(message, 'buffer', {}, { logger });
  if (!Buffer.isBuffer(buffer)) throw new Error('Media download did not return a Buffer');
  if (buffer.length > maxBytes) throw new Error('Media exceeds configured size limit');
  return buffer;
}

export function getQuotedMessage(message) {
  const content = unwrapMessage(message.message);
  const type = getContentType(content);
  const context = type ? content[type]?.contextInfo : null;
  if (!context?.quotedMessage || !context.stanzaId) return null;
  return {
    key: {
      remoteJid: message.key.remoteJid,
      id: context.stanzaId,
      participant: context.participant || message.key.participant
    },
    message: context.quotedMessage
  };
}
