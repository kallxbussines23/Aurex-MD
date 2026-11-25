# AUREX-MD

Modular WhatsApp bot built with Node.js and Baileys.

## Requirements

- Node.js 20 or newer
- FFmpeg and FFprobe with libwebp, libwebp_anim, and libopus encoders

## Setup

```bash
npm install
cp .env.example .env
npm start
```

### Login (Pairing Code only)

Aurex-MD uses **WhatsApp Pairing Code as its only login method**. QR login is disabled and is not available as a fallback.

On the first start, enter your WhatsApp number in international format when prompted (country code and digits only, for example `62812xxxxxxxx`). The bot prints a pairing code. In WhatsApp, open **Linked devices → Link a device → Link with phone number**, then enter that code.

After successful pairing, the session is saved in `auth/` and reused automatically on later starts. If you log the device out, restart Aurex-MD and enter the number again. Keep `.env` and `auth/` private; never share or commit session credentials.

## Commands

- `.menu` — list available commands
- `.plugins` — list loaded plugins
- `.sa` — start Audio Sticker creation by replying to an image or video
- `.default` — use the source video's original audio
- `.custom` — choose a custom VN/audio file for a video
- `.cancel` — cancel the current Audio Sticker session

## Audio Sticker flows

- **Video:** reply with `.sa`, then choose `.default` or `.custom`. If the video has no audio stream, the session remains active and the bot asks for `.custom`.
- **Image:** reply with `.sa`, then send a VN or audio file.
- Audio is normalized to Ogg/Opus, limited to seven seconds, and trimmed to match the visual duration.
- Each session is isolated by chat and sender and expires automatically after the configured TTL.

The Audio Sticker transport uploads the WebP and Opus media, encodes the uploaded audio metadata into the StickerMessage protobuf field 26, validates the encoded message locally, and relays a single WhatsApp message. This is a protocol-level extension because the stock Baileys schema does not expose a stable public Audio Sticker helper. Client compatibility still needs a real linked-device send/receive test; CI validates protobuf embedding and media generation, not WhatsApp server acceptance or playback on every client.

## Plugin architecture

Place each feature in its own folder under `src/plugins/`. A plugin exports a default manifest with `name`, `version`, and `register(api)`. Commands and message handlers are scoped to their plugin and removed when it is unloaded.

## Tests

```bash
npm test
npm run check
```

GitHub Actions installs FFmpeg, checks JavaScript syntax, runs unit tests, and exercises video/image-to-WebP plus Opus media processing.

## Privacy and safety

Use only media you have permission to process. WhatsApp session files contain credentials: never share or commit the `auth/` directory. Avoid sending private media to bots you do not control.
