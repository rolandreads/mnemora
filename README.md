# Mnemora

Birthday notifications on autopilot. Fetches birthdays from Google Sheets, sends WhatsApp messages to your group chat.

Built for a 50+ member beach volleyball community.

## Features

- **Daily checks** — scans Google Sheets every morning
- **WhatsApp notifications** — sends birthday messages to your group chat
- **Monthly digests** — posts upcoming birthdays on the 1st of each month
- **Runs on a Raspberry Pi** — systemd timer, ~$0/month

## Quick Start

```bash
bun install
op run --env-file=.env.tpl -- bun run start  # Scan QR code to link WhatsApp
```

## Project Structure

```
src/
├── clients/     # Google Sheets, WhatsApp
├── services/    # Birthday check orchestration
├── utils/       # Date, name, and logging helpers
└── config.ts    # Centralized configuration
systemd/         # Service and timer units
```

## Tech Stack

TypeScript · Bun · Biome · 1Password · systemd · Google APIs · Baileys (WhatsApp Web)

## License

ISC
