import test from 'node:test';
import assert from 'node:assert/strict';

test('Baileys integration modules import successfully', async () => {
  const media = await import('../src/core/media.js');
  const connection = await import('../src/core/connection.js');
  const plugin = await import('../src/plugins/audio-sticker/index.js');
  assert.equal(typeof media.downloadMessageMedia, 'function');
  assert.equal(typeof connection.startConnection, 'function');
  assert.equal(plugin.default.name, 'audio-sticker');
});
