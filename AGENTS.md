# AGENTS.md

## Scope and Precedence

- This file is the canonical, model-agnostic guidance for coding agents working in this repository.
- System, developer, and runtime/tool instructions override this file when they conflict.

## Project Overview

Mnemora is a TypeScript birthday notification bot that fetches birthdays from Google Sheets and sends WhatsApp notifications. It runs on a Raspberry Pi via a systemd timer, once per day.

## Commands

```bash
bun install           # Install dependencies
bun run dev           # Start development with watch mode
bun run start         # Run birthday check once
bun run typecheck     # Type check without emitting
bun run lint          # Run Biome linter
bun run lint:fix      # Auto-fix lint issues
bun run format        # Format code with Biome
bun run check         # Lint + format in one pass
```

## Architecture

```
src/
├── clients/        # External service clients (googleSheets, whatsapp)
├── services/       # Core business logic (birthday check orchestration)
├── scripts/        # Release automation
├── utils/          # Shared utilities (date, birthday, name helpers, logger, runtime)
├── types/          # Third-party type declarations
├── config.ts       # Centralized app configuration
├── types.ts        # Shared type definitions (BirthdayRecord, Logger, QRAuthenticationRequiredError)
└── index.ts        # Entry point
systemd/            # systemd service and timer units
```

## Environment Setup

Secrets are managed via 1Password. The `.env.tpl` file contains `op://` references.

For local development:
```bash
op run --env-file=.env.tpl -- bun run dev
```

For production (Pi), systemd injects `OP_SERVICE_ACCOUNT_TOKEN` via `/etc/mnemora/env`, and the service runs `op run --env-file=.env.tpl -- bun run src/index.ts`.

## Key Files

- `src/index.ts` — Entry point
- `src/config.ts` — Centralized configuration (reads process.env, injected by `op run`)
- `src/services/birthday.ts` — Core orchestration
- `src/clients/whatsapp.ts` — WhatsApp Web client (Baileys)
- `src/clients/googleSheets.ts` — Google Sheets API client
- `.env.tpl` — 1Password secret references (committed, not actual secrets)
- `systemd/` — systemd service and timer units

## Gotchas

- `@whiskeysockets/baileys` MUST be locked to exactly `6.7.21` (no ^ or ~) — newer versions add ~25MB of unused dependencies
- No automated tests — verification is `bun run typecheck` + `bun run lint`
- WhatsApp auth state stored in `auth_info/` (gitignored) — if lost, re-scan QR code
- First run requires interactive QR scan: `op run --env-file=.env.tpl -- bun run start`

## Workflow Orchestration

### 1. Planning for Non-Trivial Work
- For any non-trivial task (3+ steps or architectural decisions), write a brief plan before coding.
- If implementation goes sideways, stop and re-plan before continuing.
- Include verification in the plan, not only implementation.
- After completing or abandoning planned work, delete temporary plan files.

### 2. Parallel Exploration Strategy
- Offload research, exploration, and parallel analysis to subagents or equivalent parallel workflows when available.
- For complex problems, use additional parallel compute intentionally.
- Keep one focused objective per subagent.

### 3. Self-Improvement Loop
- After any correction from the user, capture the mistake pattern and add a rule to avoid repeating it.
- Iterate on those rules until the same class of mistake stops recurring.

### 4. Verification Before Done
- Never mark a task complete without proving it works.
- Diff behavior between `main` and your changes when relevant.
- Ask whether the result would be accepted by a staff engineer.
- Run checks, inspect logs, and demonstrate correctness.

### 5. Demand Elegance (Balanced)
- For non-trivial changes, pause and evaluate whether there is a more elegant implementation.
- If a fix feels hacky, re-implement using the best known design.
- Skip over-engineering for simple, obvious fixes.

### 6. Autonomous Bug Fixing
- When given a bug report, fix it without requiring hand-holding.
- Use logs, errors, and failing checks to identify root cause and resolve it.
- Minimize context switching required from the user.

## Git Workflow

- Before starting feature work, use git worktrees for isolated branches when running parallel sessions.
- Never commit directly to `main`.
- Clean up worktrees after merge: `git worktree remove <path>`.
- When branch work is complete, push and create a PR targeting `main` by default.

## Definition of Done

- `bun run typecheck`
- `bun run lint`

## Core Principles

- **Never Leak Secrets**: Never log, print, or include secrets in output. When debugging, reference variable names only.
- **Clean Up After Refactors**: After major structural changes, run a cleanup pass for indentation, dead code, redundant checks, and orphaned files.
- **Simplicity First**: Keep changes as simple as possible and impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes.
- **Minimal Impact**: Touch only what is necessary and avoid introducing new bugs.
