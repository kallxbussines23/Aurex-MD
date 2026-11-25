import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionManager } from '../src/core/session-manager.js';

test('session manager stores, retrieves, and deletes values', () => {
  const sessions = new SessionManager(10_000);
  sessions.set('chat:user', { stage: 'await-audio' });
  assert.equal(sessions.get('chat:user').stage, 'await-audio');
  assert.equal(sessions.delete('chat:user'), true);
  assert.equal(sessions.get('chat:user'), undefined);
});

test('session manager expires sessions', async () => {
  const sessions = new SessionManager(20);
  sessions.set('temporary', true);
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(sessions.get('temporary'), undefined);
});

test('session cleanup hook runs when the session expires', async () => {
  const sessions = new SessionManager(20);
  let cleaned = false;
  sessions.set('cleanup', true, () => { cleaned = true; });
  await new Promise(resolve => setTimeout(resolve, 40));
  assert.equal(cleaned, true);
});

test('clear awaits cleanup hooks', async () => {
  const sessions = new SessionManager(10_000);
  let cleaned = false;
  sessions.set('cleanup', true, async () => { cleaned = true; });
  await sessions.clear();
  assert.equal(cleaned, true);
});
