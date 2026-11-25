import test from 'node:test';
import assert from 'node:assert/strict';
import { proto } from '@whiskeysockets/baileys';
import {
  attachAudioToSticker,
  detachAudioFromSticker,
  installAudioStickerEncoder,
  readEmbeddedAudioSticker
} from '../src/plugins/audio-sticker/encoder-patch.js';

test('encoder embeds AudioMessage as StickerMessage field 26 and cleans it up', () => {
  installAudioStickerEncoder(proto);
  const hash = Buffer.from('aurex-test-sticker-hash');
  const audio = proto.Message.AudioMessage.encode(
    proto.Message.AudioMessage.create({
      mimetype: 'audio/ogg; codecs=opus',
      seconds: 1,
      ptt: true
    })
  ).finish();

  const sticker = proto.Message.StickerMessage.create({
    fileSha256: hash,
    mimetype: 'image/webp',
    width: 512,
    height: 512
  });
  const outgoing = proto.Message.create({ stickerMessage: sticker });

  attachAudioToSticker(hash, audio);
  const encodedWithAudio = proto.Message.encode(outgoing).finish();
  const embedded = readEmbeddedAudioSticker(encodedWithAudio);
  assert.ok(embedded);
  assert.deepEqual(Buffer.from(embedded), Buffer.from(audio));

  detachAudioFromSticker(hash);
  const encodedWithoutAudio = proto.Message.encode(outgoing).finish();
  assert.equal(readEmbeddedAudioSticker(encodedWithoutAudio), null);
});
