import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startConnection } from './core/connection.js';
import { config } from './core/config.js';
import { logger } from './core/logger.js';
import { SessionManager } from './core/session-manager.js';
import { CommandHandler } from './core/command-handler.js';
import { PluginManager } from './core/plugin-manager.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const sessions = new SessionManager(config.sessionTtlMs);
const commands = new CommandHandler(config.prefix);
let activeSocket;

const api = {
  commands,
  sessions,
  logger,
  onMessage(handler) {
    this.messageHandlers ||= [];
    this.messageHandlers.push(handler);
  },
  messageHandlers: []
};

const plugins = new PluginManager({
  directory: path.join(root, 'plugins'),
  api,
  logger
});

await fs.mkdir(config.tempDir, { recursive: true });
const loaded = await plugins.loadAll();
logger.info({ loaded }, 'Plugin initialization complete');

async function onSocket(sock) {
  activeSocket = sock;
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const message of messages) {
      if (!message.message || message.key.fromMe) continue;
      const jid = message.key.remoteJid;
      const sender = message.key.participant || message.key.remoteJid;
      const text = extractText(message.message);
      const context = { sock, message, jid, sender, text };
      try {
        const handled = await commands.dispatch(context);
        if (handled) continue;
        for (const handler of api.messageHandlers) {
          const consumed = await handler(context);
          if (consumed) break;
        }
      } catch (error) {
        logger.error({ err: error, jid }, 'Message handler failed');
        await sock.sendMessage(jid, { text: 'Terjadi kesalahan saat memproses pesan.' }, { quoted: message }).catch(() => {});
      }
    }
  });
  logger.info({ commands: commands.list() }, 'Commands registered');
}

function extractText(message) {
  const content = message.conversation
    || message.extendedTextMessage?.text
    || message.imageMessage?.caption
    || message.videoMessage?.caption
    || message.documentMessage?.caption
    || '';
  return typeof content === 'string' ? content.trim() : '';
}

await startConnection({ logger, onSocket });

process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);

async function shutdown() {
  logger.info('Shutting down AUREX-MD');
  sessions.clear();
  if (activeSocket?.end) activeSocket.end(undefined);
  process.exit(0);
}
