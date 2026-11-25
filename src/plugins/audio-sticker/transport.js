/**
 * The stock Baileys 7.0.0-rc14 public sendMessage API does not provide a
 * documented Audio Sticker transport. Keep this boundary explicit: never
 * silently send a normal sticker plus a separate audio message.
 *
 * A compatible adapter may be supplied as an ESM module through
 * AUREX_AUDIO_STICKER_ADAPTER. It must export:
 *   async function sendAudioSticker({ sock, jid, stickerPath, audioPath, quoted })
 */
export async function sendEmbeddedAudioSticker(payload) {
  const adapterPath = process.env.AUREX_AUDIO_STICKER_ADAPTER;
  if (!adapterPath) {
    throw new Error(
      'Audio Sticker transport is not configured. Media processing is ready, but the current Baileys build has no stable public embedded-audio sticker sender. Configure a verified adapter before using this feature.'
    );
  }
  const adapterUrl = adapterPath.startsWith('file:')
    ? adapterPath
    : new URL(adapterPath, `file://${process.cwd()}/`).href;
  const adapter = await import(adapterUrl);
  if (typeof adapter.sendAudioSticker !== 'function') {
    throw new Error('Audio Sticker adapter must export sendAudioSticker()');
  }
  return adapter.sendAudioSticker(payload);
}
