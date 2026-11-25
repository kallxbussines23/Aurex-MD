import makeWASocket, { DisconnectReason, useMultiFileAuthState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { config } from './config.js';

let requestedPhoneNumber = '';

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
        reconnectTimer.unref?.();
      }
    });

    if (!state.creds.registered) {
      try {
        // Give the socket time to initialize before requesting the pairing code.
        await new Promise(resolve => setTimeout(resolve, 1_500));
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
        throw error;
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
