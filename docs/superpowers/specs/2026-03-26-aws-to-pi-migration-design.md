# Mnemora: AWS Lambda to Raspberry Pi Migration

Migrate Mnemora from AWS Lambda (Node.js/Yarn/SAM) to a local Raspberry Pi running Bun, with Biome for linting/formatting and 1Password for secrets management.

## Migration Summary

| Layer | Current (AWS) | Target (Pi) |
|-------|--------------|-------------|
| Runtime | Node.js 24 + Yarn 4 on Lambda | Bun (local) |
| Linting/Formatting | ESLint (flat config) | Biome |
| Secrets | `.env` + dotenv | 1Password `op run` + service account token |
| Session storage | S3 tar.gz archive | Local `auth_info/` directory |
| Scheduling | EventBridge cron (UTC) | systemd timer (timezone-aware) |
| Entry point | Lambda handler + local index.ts | Single `src/index.ts` |
| Package manager | Yarn 4 | Bun |
| Infrastructure | SAM/CloudFormation | systemd unit files |

## What Gets Removed

### Files to delete

- `src/lambda/handler.ts` — Lambda handler entry point
- `src/lambda/types.ts` — Lambda event/context type definitions
- `src/lambda/` — entire directory
- `src/clients/s3.ts` — S3 session storage client (FileStorage class)
- `src/scripts/build-lambda.ts` — Lambda build script
- `src/scripts/package-lambda.ts` — Lambda packaging script
- `src/scripts/lambda-cleanup.ts` — Lambda dependency cleanup
- `infrastructure/template.yaml` — SAM/CloudFormation template
- `infrastructure/samconfig.toml` — SAM CLI config
- `infrastructure/README.md` — Infrastructure docs
- `infrastructure/` — entire directory
- `scripts/deploy.sh` — AWS deployment script
- `scripts/` — entire directory (only contained deploy.sh)
- `eslint.config.js` — replaced by biome.json
- `.env` — secrets move to 1Password (will not be committed)

### Dependencies to remove

- `@aws-sdk/client-s3` — no more S3
- `dotenv` — replaced by `op run` injecting env vars
- `tar` — was for S3 session archiving
- `eslint` + all `@typescript-eslint/*` packages — replaced by Biome
- `husky` — reassess; if only running eslint, replace with biome in a simple pre-commit

### Code to remove

- All Lambda detection logic in `src/utils/runtime.util.ts` (`isLambda()`, Lambda context extraction, `AWS_LAMBDA_*` env var reads)
- S3 sync calls in `src/clients/whatsapp.ts` (download on init, upload on destroy)
- S3 bucket config in `src/config.ts` (`aws.region`, `aws.s3Bucket`)
- Base64 private key decoding in `src/config.ts` (`processPrivateKey()` base64 branch — keep PEM support)
- Lambda-specific timeout warning logic
- All `infrastructure/` references in AGENTS.md and README

## What Gets Added

### `biome.json`

Adopt sf-human's Biome config. Identical rules — single quotes, semicolons, 120-char lines, 2-space indent, strict linting (no `any`, no unused vars, no CommonJS). Adjust `includes` ignore patterns for Mnemora's directory structure (no `r2-uploader/` to exclude, but exclude `dist/` and `auth_info/`).

### `PHILOSOPHY.md`

Adapted from sf-human. Principles that carry over directly:

1. **Minimal external dependencies** — own what you can
2. **Modern, fast, opinionated tooling** — Biome over ESLint, Bun over Node
3. **AI-agent manageable** — system state introspectable from the repo
4. **Bold moves over safe choices** — hobby project, pick the interesting path
5. **Single process** — one Bun invocation does everything
6. **Fail loud internally, resilient externally** — log everything, users see graceful degradation
7. **Clean, compact, elegant** — minimum lines, readable at a glance
8. **One developer + AI agents** — architecture assumes solo dev + AI

Principles adapted for Mnemora's context:

- **Secrets via 1Password** (replaces sf-human's git-crypt approach) — `op run` injects secrets at runtime, only bootstrap token lives on the Pi
- **Scheduled execution** (replaces sf-human's long-running process) — systemd timer fires daily, process runs and exits
- **No event sourcing** — Mnemora is a simple daily task, not a stateful application

Principles that don't apply (omit):

- Event sourcing / SQLite backbone (no state to track)
- Conversation is the UI (no interactive users)
- Cost-aware by default (no LLM calls or metered APIs)
- Max insight zero identity (no user data beyond names/birthdays)
- Bespoke over generic / hacker aesthetic (birthday bot, not a platform)

### `systemd/mnemora.service`

```ini
[Unit]
Description=Mnemora birthday bot
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=mnemora
Group=mnemora
EnvironmentFile=/etc/mnemora/env
WorkingDirectory=/opt/mnemora
ExecStart=/usr/bin/op run --env-file=.env.tpl -- bun run src/index.ts
TimeoutStartSec=300

[Install]
WantedBy=multi-user.target
```

- `User=mnemora` / `Group=mnemora` — dedicated service account, no login shell
- `EnvironmentFile=/etc/mnemora/env` contains only `OP_SERVICE_ACCOUNT_TOKEN=<token>`, permissions `600 root:root` (systemd reads it as root before dropping to `mnemora` user)
- `TimeoutStartSec=300` — generous timeout for WhatsApp connection + Google Sheets fetch
- `WorkingDirectory=/opt/mnemora` — repo checkout owned by `mnemora:mnemora`

### `systemd/mnemora.timer`

```ini
[Unit]
Description=Run Mnemora birthday check daily at 9 AM Pacific

[Timer]
OnCalendar=*-*-* 09:00:00 America/Los_Angeles
Persistent=true
RandomizedDelaySec=120

[Install]
WantedBy=timers.target
```

- `Persistent=true` — if the Pi was off at 9 AM, run as soon as it boots
- `RandomizedDelaySec=120` — small jitter to avoid exact-second race conditions
- Timezone-aware scheduling (no more UTC-to-Pacific mental math)

### `.env.tpl`

Template file committed to the repo. Contains `op://` references, not actual secrets:

```bash
GOOGLE_CLIENT_EMAIL=op://Private/Mnemora/GOOGLE_CLIENT_EMAIL
GOOGLE_PRIVATE_KEY=op://Private/Mnemora/GOOGLE_PRIVATE_KEY
GOOGLE_PROJECT_ID=op://Private/Mnemora/GOOGLE_PROJECT_ID
GOOGLE_SPREADSHEET_ID=op://Private/Mnemora/GOOGLE_SPREADSHEET_ID
WHATSAPP_GROUP_NAME=op://Private/Mnemora/WHATSAPP_GROUP_NAME
```

`op run --env-file=.env.tpl` resolves these references at runtime and injects real values as environment variables.

### Pi Bootstrap Documentation

Add a section to README or a `docs/pi-setup.md` covering:

1. Create service user: `sudo useradd --system --shell /usr/sbin/nologin --home-dir /opt/mnemora --create-home mnemora`
2. Install Bun on Pi (ARM64) — install system-wide or in `/opt/mnemora`
3. Install 1Password CLI (`op`)
4. Create 1Password service account, store token in `/etc/mnemora/env` (`sudo mkdir /etc/mnemora && sudo chmod 700 /etc/mnemora`)
5. Create the 1Password vault item with the 5 secrets
6. Clone repo to `/opt/mnemora`, chown to `mnemora:mnemora`, `bun install`
7. Initial WhatsApp auth (as mnemora user): `sudo -u mnemora op run --env-file=.env.tpl -- bun run src/index.ts` (scan QR — one-time interactive step)
8. Copy systemd units to `/etc/systemd/system/`, then `sudo systemctl enable --now mnemora.timer`

## What Gets Modified

### `package.json`

- Remove `engines` Node.js version constraint
- Remove Yarn `packageManager` field
- Replace all scripts:
  - `"dev": "bun --watch src/index.ts"`
  - `"start": "bun run src/index.ts"`
  - `"lint": "biome lint src/"`
  - `"lint:fix": "biome lint --write src/"`
  - `"format": "biome format --write src/"`
  - `"check": "biome check --write src/"`
  - `"typecheck": "tsc --noEmit"`
- Remove all Lambda/deploy scripts (`build:lambda`, `package:lambda`, `deploy`, `deploy:force`, `deploy:config`, `invoke:lambda`)
- Remove all AWS SDK, ESLint, dotenv, tar, husky dependencies
- Add `@biomejs/biome` as devDependency

### `tsconfig.json`

- Keep strict mode, ES module output
- Adjust `target` and `module` if needed for Bun compatibility
- Remove any Lambda-specific paths

### `src/config.ts`

- Remove `dotenv` import and `config()` call
- Remove `aws` config block (`region`, `s3Bucket`)
- Remove base64 branch from `processPrivateKey()` (keep PEM handling)
- Remove `environment` field (always "production" on Pi, irrelevant)
- Simplify: just read `process.env` directly (injected by `op run`)
- Hardcode non-secret defaults: `timezone: 'America/Los_Angeles'`, `logLevel: 'info'`

### `src/index.ts`

- Remove Lambda detection / conditional paths
- Remove S3 session sync
- Simplify to: create logger, call `runBirthdayCheck()`, exit
- This becomes the only entry point

### `src/clients/whatsapp.ts`

- Remove all S3 sync logic (download session on init, upload on destroy)
- Remove `FileStorage` / S3 client usage
- Session directory is always `auth_info/` in the project root (already works this way in local dev)
- Keep QR code display, retry logic, group resolution, auth age tracking

### `src/utils/runtime.util.ts`

- Remove `isLambda()` and all `AWS_LAMBDA_*` env var checks
- Keep correlation ID generation (useful for log tracing)
- This file becomes very small — may fold into logger or remove entirely

### `AGENTS.md`

- Update architecture description (Pi + Bun + systemd, not Lambda)
- Update command reference (bun scripts, not yarn)
- Update environment setup (1Password, not .env)
- Remove SAM/CloudFormation/deploy sections
- Add systemd management commands
- Update gotchas (no more Lambda timeout concerns, no S3 sync)

### `README.md`

- Update tech stack description
- Update quick start for Pi deployment
- Remove AWS cost estimate
- Add 1Password setup instructions

## Security Model

### Secret Lifecycle

1. **At rest**: Secrets live in 1Password vault only. Never on disk in plaintext.
2. **Bootstrap**: Single `OP_SERVICE_ACCOUNT_TOKEN` in `/etc/mnemora/env` (600 root:root). This is the only secret on the Pi's filesystem. systemd reads it as root before dropping privileges to the `mnemora` user.
3. **At runtime**: `op run --env-file=.env.tpl` resolves `op://` references, injects real values as environment variables into the Bun process running as `mnemora`. They exist only in process memory for the duration of the run.
4. **In the repo**: `.env.tpl` contains `op://` references (not secrets). Safe to commit.

### Service User Isolation

- `mnemora` is a system user with no login shell (`/usr/sbin/nologin`)
- Home directory: `/opt/mnemora` (the repo checkout)
- Owns: repo files, `auth_info/` (WhatsApp session), `bun.lockb`, `node_modules/`
- Cannot: SSH in, run interactive shells, access other users' files
- The `OP_SERVICE_ACCOUNT_TOKEN` is never readable by the `mnemora` user directly — systemd injects it into the process environment

### What NOT to do

- Never store actual secret values in `.env`, config files, or systemd units
- Never pass `OP_SERVICE_ACCOUNT_TOKEN` as a CLI argument (visible in `ps`)
- Never log secret values (config.ts should not log the config object)

## 1Password Vault Setup

Create a vault item named "Mnemora" in the "Private" vault with these fields:

| Field | Type | Value |
|-------|------|-------|
| `GOOGLE_CLIENT_EMAIL` | text | Service account email |
| `GOOGLE_PRIVATE_KEY` | concealed | PEM private key (not base64) |
| `GOOGLE_PROJECT_ID` | text | Google Cloud project ID |
| `GOOGLE_SPREADSHEET_ID` | text | Google Sheets document ID |
| `WHATSAPP_GROUP_NAME` | text | Target WhatsApp group name |

## Non-Goals

- **No Docker/containers** — Bun runs natively on ARM64, no containerization needed
- **No remote backup of WhatsApp sessions** — re-scan QR if needed
- **No monitoring/alerting beyond journald** — check `journalctl -u mnemora` if something seems off
- **No tests** (pre-existing decision, not changing in this migration)
- **No CI/CD** — deploy by pulling the repo on the Pi
