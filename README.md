# AUREX-MD

Modular WhatsApp bot built with Node.js and Baileys.

> Audio Sticker support is an experimental plugin until end-to-end compatibility is verified against real WhatsApp clients.

## Requirements

- Node.js 20 or newer
- FFmpeg available on `PATH`

## Setup

```bash
npm install
cp .env.example .env
npm start
```

On first start, scan the QR code printed in the terminal. Keep `.env`, `auth/`, and generated media private.

## Commands

- `.menu` — list available commands
- `.sa` — start Audio Sticker creation by replying to an image or video
- `.default` — use the source video's audio
- `.custom` — use a supplied voice note/audio file
- `.cancel` — cancel the current Audio Sticker session

## Plugin architecture

Place each feature in its own folder under `plugins/`. Plugins export metadata and a `register(api)` function. Core owns the WhatsApp connection, command routing, sessions, and plugin lifecycle.

## Audio Sticker compatibility

The plugin prepares the visual and audio media independently. The final embedded-audio sticker transport is guarded behind an experimental encoder adapter because standard Baileys send helpers do not expose a stable public Audio Sticker API. Do not treat a successful media preparation as proof that WhatsApp accepted an embedded-audio sticker.

## Safety and privacy

Use only media you have permission to process. Never commit WhatsApp auth credentials, private media, or `.env` files.
