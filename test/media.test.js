import test from 'node:test';
import assert from 'node:assert/strict';
import { getMediaKind } from '../src/core/media.js';

test('media kind recognizes images, videos, voice notes, and audio documents', () => {
  assert.equal(getMediaKind({ imageMessage: {} }), 'image');
  assert.equal(getMediaKind({ videoMessage: {} }), 'video');
  assert.equal(getMediaKind({ audioMessage: {} }), 'audio');
  assert.equal(getMediaKind({ documentMessage: { mimetype: 'audio/mpeg' } }), 'audio');
  assert.equal(getMediaKind({ documentMessage: { mimetype: 'application/pdf' } }), null);
});
