import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { config } from './config.js';

let requestedPhoneNumber = '';

const waitForWebSocket = async (sock, timeoutMs = 20_000) => {
  const startedAt = Date.now();

  while (!sock.ws?.isOpen) {
    if (sock.ws?.isClosed || sock.ws?.isClosing) {
      throw new Error('WebSocket closed before pairing initialization');
    }
    if (Date.now() - startedAt >= timeoutMs) {
      throw new Error('Timed out waiting for WhatsApp WebSocket');
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  // The WebSocket opening event starts the Noise handshake asynchronously.
  // Give that handshake time to finish before sending the pairing IQ.
  await new Promise(resolve => setTimeout(resolve, 3_000));

  if (!sock.ws?.isOpen) {
    throw new Error('WebSocket closed during WhatsApp handshake');
  }
};

async function askPhoneNumber() {
  while (true) {
    const rl = createInterface({ input, output });
    let answer;
    try {
      answer = await rl.question('\nMasukkan nomor WhatsApp (contoh 62812xxxxxxxx): ');
    } finally {
      rl.close();
    }

    const number = answer.replace(/[^0-9]/g, '');
    if (number.length >= 8 && number.length <= 15 && !number.startsWith('0')) {
      return number;
    }

    console.log('Nomor tidak valid. Gunakan kode negara, misalnya 62812xxxxxxxx.');
  }
}

export async function startConnection({ logger, onSocket }) {
  let stopped = false;
  let reconnectTimer;
  let attempts = 0;

  const connect = async () => {
    if (stopped) return;
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionDir);

    // Pairing Code adalah satu-satunya metode pendaftaran perangkat.
    if (!state.creds.registered && !requestedPhoneNumber) {
      requestedPhoneNumber = await askPhoneNumber();
    }

    const sock = makeWASocket({
      auth: state,
      logger,
      printQRInTerminal: false,
      markOnlineOnConnect: false
    });

    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', async ({ connection, lastDisconnect }) => {
      if (connection === 'open') {
        attempts = 0;
        logger.info({ user: sock.user?.id }, 'WhatsApp connected');
        await onSocket(sock);
      }

      if (connection === 'close' && !stopped) {
        const statusCode = new Boom(lastDisconnect?.error).output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          logger.error('WhatsApp session logged out. Restart Aurex-MD to pair again.');
          requestedPhoneNumber = '';
          return;
        }

        attempts += 1;
        const delay = Math.min(30_000, 1_000 * (2 ** Math.min(attempts, 5)));
        logger.warn({ statusCode, delay }, 'Connection closed; reconnect scheduled');
        clearTimeout(reconnectTimer);
        reconnectTimer = setTimeout(() => {
          connect().catch(error => logger.error({ err: error }, 'Reconnect failed'));
        }, delay);
        // Keep the Node.js process alive while the reconnect is pending.
      }
    });

    if (!state.creds.registered) {
      try {
        // Wait for the transport and Noise handshake instead of relying on a
        // short fixed delay, which can race on slower mobile connections.
        await waitForWebSocket(sock);
        const code = await sock.requestPairingCode(requestedPhoneNumber);
        console.log('\n========================================');
        console.log(' AUREX-MD — WHATSAPP PAIRING CODE');
        console.log('========================================');
        console.log(' Nomor : +' + requestedPhoneNumber);
        console.log(' Kode  : ' + code);
        console.log('========================================');
        console.log('WhatsApp > Perangkat tertaut > Tautkan perangkat');
        console.log('Pilih opsi tautkan dengan nomor telepon, lalu masukkan kode di atas.\n');
      } catch (error) {
        logger.error({ err: error }, 'Failed to generate pairing code');
        try { sock.end(error); } catch {}
        // The connection.update close handler schedules a clean reconnect.
        // Keep the process alive instead of crashing Termux with an uncaught error.
        return sock;
      }
    }

    return sock;
  };

  await connect();
  return async () => {
    stopped = true;
    clearTimeout(reconnectTimer);
  };
}
