import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import { config } from './config.js';

export async function startConnection({ logger, onSocket }) {
  let stopped = false;
  let reconnectTimer;
  let attempts = 0;

  const connect = async () => {
    if (stopped) return;
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);
    const sock = makeWASocket({
      auth: state,
      logger,
      printQRInTerminal: false,
      markOnlineOnConnect: false,
      browser: ['AUREX-MD', 'Chrome', '1.0.0']
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        logger.info('Scan QR code berikut untuk menghubungkan WhatsApp:');
        qrcode.generate(qr, { small: true });
      }
      if (connection === 'open') {
        attempts = 0;
        logger.info({ user: sock.user?.id }, 'WhatsApp connected');
        await onSocket(sock);
      }
      if (connection === 'close' && !stopped) {
        const statusCode = new Boom(lastDisconnect?.error).output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          logger.error('WhatsApp session logged out. Remove auth folder and pair again.');
          return;
        }
        attempts += 1;
        const delay = Math.min(30_000, 1_000 * (2 ** Math.min(attempts, 5)));
        logger.warn({ statusCode, delay }, 'Connection closed; reconnect scheduled');
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(connect, delay);
        reconnectTimer.unref?.();
      }
    });

    if (config.pairingNumber && !state.creds.registered) {
      const code = await sock.requestPairingCode(config.pairingNumber);
      logger.info({ pairingCode: code }, 'Enter this pairing code in WhatsApp Linked Devices');
    }
    return sock;
  };

  await connect();
  return async () => {
    stopped = true;
    clearTimeout(reconnectTimer);
  };
}
