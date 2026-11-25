const AUDIO_FIELD_NUMBER = 26;
const AUDIO_FIELD_TAG = (AUDIO_FIELD_NUMBER << 3) | 2;
const PATCH_MARK = Symbol.for('aurex-md.audio-sticker-encoder-patched');
const pendingAudio = new Map();

function hashKey(hash) {
  return Buffer.from(hash).toString('base64');
}

export function attachAudioToSticker(hash, encodedAudioMessage) {
  if (!hash || !encodedAudioMessage) throw new TypeError('Sticker hash and encoded audio are required');
  pendingAudio.set(hashKey(hash), Buffer.from(encodedAudioMessage));
}

export function detachAudioFromSticker(hash) {
  if (hash) pendingAudio.delete(hashKey(hash));
}

export function installAudioStickerEncoder(proto) {
  const StickerMessage = proto?.Message?.StickerMessage;
  if (!StickerMessage?.encode) throw new Error('Baileys StickerMessage encoder is unavailable');
  if (StickerMessage.encode[PATCH_MARK]) return;

  const originalEncode = StickerMessage.encode;
  const patchedEncode = function (message, writer) {
    const result = originalEncode.call(this, message, writer);
    const hash = message?.fileSha256;
    const audio = hash ? pendingAudio.get(hashKey(hash)) : null;
    if (audio) result.uint32(AUDIO_FIELD_TAG).bytes(audio);
    return result;
  };
  patchedEncode[PATCH_MARK] = true;
  StickerMessage.encode = patchedEncode;
}

function readVarint(buffer, state) {
  let value = 0;
  let shift = 0;
  while (state.offset < buffer.length && shift < 35) {
    const byte = buffer[state.offset++];
    value |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return value >>> 0;
    shift += 7;
  }
  throw new Error('Malformed protobuf varint');
}

export function findLengthDelimitedField(buffer, wantedField) {
  const bytes = Buffer.from(buffer);
  const state = { offset: 0 };
  while (state.offset < bytes.length) {
    const tag = readVarint(bytes, state);
    const field = tag >>> 3;
    const wire = tag & 7;
    if (wire === 0) {
      readVarint(bytes, state);
    } else if (wire === 1) {
      state.offset += 8;
    } else if (wire === 2) {
      const length = readVarint(bytes, state);
      const end = state.offset + length;
      if (end > bytes.length) throw new Error('Malformed protobuf length');
      const payload = bytes.subarray(state.offset, end);
      if (field === wantedField) return payload;
      state.offset = end;
    } else if (wire === 5) {
      state.offset += 4;
    } else {
      throw new Error(`Unsupported protobuf wire type: ${wire}`);
    }
    if (state.offset > bytes.length) throw new Error('Malformed protobuf field');
  }
  return null;
}

export function readEmbeddedAudioSticker(encodedMessage) {
  const stickerBytes = findLengthDelimitedField(encodedMessage, 26);
  if (!stickerBytes) return null;
  return findLengthDelimitedField(stickerBytes, AUDIO_FIELD_NUMBER);
}
