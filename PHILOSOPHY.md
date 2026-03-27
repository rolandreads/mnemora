# Philosophy

Core design principles for Mnemora. Adapted from sf-human, tailored for a scheduled birthday bot running on a Raspberry Pi.

## 1. Minimal external dependencies

Every dependency is a liability. Own what you can. Write the 50 lines instead of importing a package. The code you own is the code you control.

## 2. Modern, fast, opinionated tooling

Biome over ESLint. Bun over Node. Pick active projects, prefer native speed, single tools over tool chains.

## 3. AI-agent manageable

If an agent can't `cat` it, `SELECT` it, or `git diff` it, it's the wrong approach. The entire system state should be introspectable from the repo alone.

## 4. Bold moves over safe choices

This isn't enterprise software. Pick the interesting path. If the conventional choice bores you, that's a signal to find a better one.

## 5. Single process, run and exit

One Bun invocation does everything — fetch birthdays, send messages, exit. No daemons, no long-running processes, no restart loops. systemd handles scheduling.

## 6. Secrets via 1Password

`op run` injects secrets at runtime. Only the bootstrap token lives on the Pi (`/etc/mnemora/env`, 600 root:root). No plaintext secrets on disk, no `.env` files with real values, no git-crypt complexity for a single-secret deployment.

## 7. Fail loud internally, resilient externally

Never silently swallow errors. Log everything, retry with backoff. But the WhatsApp group sees birthday messages, not stack traces.

## 8. Clean, compact, elegant

Minimum lines of code, readable at a glance. Elegant solutions over quick hacks. If the code is ugly, the product is ugly.

## 9. One developer + AI agents

Architecture assumes a solo dev augmented by AI. No decisions that require a team to maintain. If you disappear, an AI agent should be able to pick up where you left off from the repo alone.

---

**The litmus test:** Can an agent clone this repo, read AGENTS.md, and deploy it to a Pi in one session? If not, simplify.
