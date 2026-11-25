import test from 'node:test';
import assert from 'node:assert/strict';
import { CommandHandler, parseCommand } from '../src/core/command-handler.js';

test('parseCommand handles prefix and arguments', () => {
  assert.deepEqual(parseCommand('.sa now'), { name: 'sa', args: ['now'], raw: 'sa now' });
  assert.equal(parseCommand('hello'), null);
  assert.equal(parseCommand('.'), null);
});

test('CommandHandler dispatches registered commands', async () => {
  const commands = new CommandHandler('.');
  let called = false;
  commands.register('ping', async ({ args }) => { called = args[0] === 'ok'; }, 'test');
  assert.equal(await commands.dispatch({ text: '.ping ok' }), true);
  assert.equal(called, true);
  assert.deepEqual(commands.list(), ['ping']);
});

test('plugin commands can be unregistered', () => {
  const commands = new CommandHandler('.');
  commands.register('one', async () => {}, 'alpha');
  commands.register('two', async () => {}, 'beta');
  commands.unregisterPlugin('alpha');
  assert.deepEqual(commands.list(), ['two']);
});
