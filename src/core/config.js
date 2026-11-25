import 'dotenv/config';
import path from 'node:path';

const number = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const config = Object.freeze({
  prefix: process.env.PREFIX || '.',
  pairingNumber: (process.env.PAIRING_NUMBER || '').replace(/\\D/g, ''),
  sessionDir: path.resolve(process.env.SESSION_DIR || './auth'),
  tempDir: path.resolve(process.env.TEMP_DIR || './temp'),
  sessionTtlMs: number(process.env.SESSION_TTL_MS, 120_000),
  maxMediaBytes: number(process.env.MAX_MEDIA_MB, 16) * 1024 * 1024,
  logLevel: process.env.LOG_LEVEL || 'info'
});
