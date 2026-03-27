# AWS Lambda to Raspberry Pi Migration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate Mnemora from AWS Lambda (Node.js/Yarn/ESLint/dotenv/S3) to local Raspberry Pi (Bun/Biome/1Password/systemd).

**Architecture:** Remove all AWS infrastructure (Lambda handler, S3 session storage, SAM templates, deploy scripts). Replace ESLint with Biome, dotenv with 1Password `op run`, Yarn with Bun. Add systemd timer for scheduling. WhatsApp sessions persist on local disk only.

**Tech Stack:** Bun, TypeScript, Biome, 1Password CLI (`op`), systemd, Baileys (WhatsApp Web), Google Sheets API, Pino logger.

**Spec:** `docs/superpowers/specs/2026-03-26-aws-to-pi-migration-design.md`

**Verification (run after every task):**
```bash
bun run typecheck   # tsc --noEmit
bun run lint        # biome lint (after Task 1; skip before)
```

No automated tests exist in this project. Verification = typecheck + lint.

---

### Task 1: Replace ESLint with Biome and switch to Bun

**Files:**
- Create: `biome.json`
- Delete: `eslint.config.js`
- Delete: `.husky/pre-commit`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Create `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.4.8/schema.json",
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "files": {
    "ignoreUnknown": false
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "lineWidth": 120,
    "indentWidth": 2
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "always",
      "arrowParentheses": "always"
    }
  },
  "linter": {
    "enabled": true,
    "includes": [
      "**/*.ts",
      "!dist/**",
      "!auth_info/**"
    ],
    "rules": {
      "recommended": true,
      "complexity": {
        "noStaticOnlyClass": "error",
        "noUselessConstructor": "error",
        "noUselessTypeConstraint": "error",
        "useLiteralKeys": "error",
        "useOptionalChain": "error",
        "useArrowFunction": "error"
      },
      "correctness": {
        "noUnusedVariables": "error",
        "noUnusedPrivateClassMembers": "error"
      },
      "style": {
        "noCommonJs": "error",
        "noInferrableTypes": "error",
        "noNamespace": "error",
        "noNonNullAssertion": "off",
        "useAsConstAssertion": "error",
        "useConst": "error",
        "useConsistentArrayType": "error",
        "useForOf": "error",
        "useImportType": "error",
        "useShorthandFunctionType": "error",
        "useTemplate": "error"
      },
      "suspicious": {
        "noConfusingVoidType": "error",
        "noEmptyBlockStatements": "error",
        "noExplicitAny": "error",
        "noMisleadingInstantiator": "error",
        "noUnsafeDeclarationMerging": "error",
        "noVar": "error"
      }
    }
  },
  "assist": {
    "enabled": true,
    "actions": {
      "source": {
        "organizeImports": "on"
      }
    }
  }
}
```

Note: `noNonNullAssertion` is `off` (Mnemora uses `!` assertions in googleSheets.ts and the codebase is small enough to verify them manually).

- [ ] **Step 2: Update `package.json`**

Replace the entire `package.json` with the migrated version. Key changes:
- Remove `packageManager`, `engines`, `_deploymentRequirements` fields
- Replace all scripts with Bun equivalents
- Remove dependencies: `@aws-sdk/client-s3`, `dotenv`, `tar`
- Remove devDependencies: all `eslint`/`@typescript-eslint/*`, `globals`, `husky`, `lint-staged`, `tsx`, `@types/tar`
- Add devDependency: `@biomejs/biome`
- Remove `lint-staged` config block

```json
{
  "name": "mnemora",
  "version": "1.1.0",
  "description": "Bot that fetches Google Sheets birthdays and sends WhatsApp notifications",
  "main": "src/index.ts",
  "type": "module",
  "scripts": {
    "start": "bun run src/index.ts",
    "dev": "bun --watch src/index.ts",
    "typecheck": "tsc --noEmit",
    "lint": "biome lint src/",
    "lint:fix": "biome lint --write src/",
    "format": "biome format --write src/",
    "check": "biome check --write src/",
    "release:patch": "bun run src/scripts/release.ts patch",
    "release:minor": "bun run src/scripts/release.ts minor",
    "release:major": "bun run src/scripts/release.ts major",
    "release:version": "bun run src/scripts/release.ts version"
  },
  "keywords": [
    "birthday",
    "whatsapp",
    "bot"
  ],
  "author": "",
  "license": "ISC",
  "_importantNotes": {
    "@whiskeysockets/baileys": "MUST be locked to exactly 6.7.21 (no ^ or ~). Versions 6.17.16+ add audio decoders (~22MB) and lodash+libphonenumber-js (~10MB)."
  },
  "dependencies": {
    "@whiskeysockets/baileys": "6.7.21",
    "dayjs": "1.11.19",
    "google-auth-library": "9.15.1",
    "googleapis": "166.0.0",
    "pino": "10.1.0",
    "qrcode-terminal": "0.12.0"
  },
  "devDependencies": {
    "@biomejs/biome": "2.4.8",
    "@types/node": "24.10.1",
    "typescript": "5.9.3"
  }
}
```

- [ ] **Step 3: Delete ESLint config and Husky**

```bash
trash-put eslint.config.js
trash-put .husky/pre-commit
# Remove .husky dir if empty
rmdir .husky 2>/dev/null || true
```

- [ ] **Step 4: Update `.gitignore`**

Replace ESLint-specific entries with Biome, remove AWS SAM entries, add bun lockfile:

Replace:
```
# ESLint cache
.eslintcache
```
with:
```
# Biome
.biome/
```

Remove:
```
# AWS SAM
samconfig.toml
.aws-sam
```

Add:
```
# Bun
bun.lock
```

Remove:
```
# Lock files (keep yarn.lock, ignore npm lockfile)
package-lock.json
```

- [ ] **Step 5: Install deps with Bun**

```bash
trash-put yarn.lock
trash-put .yarn 2>/dev/null || true
trash-put .yarnrc.yml 2>/dev/null || true
bun install
```

- [ ] **Step 6: Verify biome works**

```bash
bun run lint
```

Fix any lint issues that appear. This is expected — biome has different rules than eslint.

- [ ] **Step 7: Commit**

```bash
git add biome.json package.json bun.lock .gitignore
git add -u  # pick up deleted eslint.config.js, .husky/pre-commit, yarn.lock
git commit -m "build: replace ESLint/Yarn with Biome/Bun"
```

---

### Task 2: Delete all AWS infrastructure files

**Files:**
- Delete: `src/lambda/handler.ts`
- Delete: `src/lambda/types.ts`
- Delete: `src/clients/s3.ts`
- Delete: `src/scripts/build-lambda.ts`
- Delete: `src/scripts/package-lambda.ts`
- Delete: `src/scripts/lambda-cleanup.ts`
- Delete: `infrastructure/template.yaml`
- Delete: `infrastructure/samconfig.toml` (if exists in worktree)
- Delete: `infrastructure/README.md`
- Delete: `scripts/deploy.sh`

- [ ] **Step 1: Delete Lambda handler and types**

```bash
trash-put src/lambda/handler.ts src/lambda/types.ts
rmdir src/lambda
```

- [ ] **Step 2: Delete S3 client**

```bash
trash-put src/clients/s3.ts
```

- [ ] **Step 3: Delete Lambda build/packaging scripts**

```bash
trash-put src/scripts/build-lambda.ts src/scripts/package-lambda.ts src/scripts/lambda-cleanup.ts
```

If `src/scripts/` only has `release.ts` left, keep the directory.

- [ ] **Step 4: Delete infrastructure directory**

```bash
trash-put infrastructure/template.yaml infrastructure/README.md
# samconfig.toml may be gitignored; trash it if it exists
test -f infrastructure/samconfig.toml && trash-put infrastructure/samconfig.toml
rmdir infrastructure
```

- [ ] **Step 5: Delete deploy script**

```bash
trash-put scripts/deploy.sh
rmdir scripts
```

- [ ] **Step 6: Commit**

```bash
git add -u
git commit -m "refactor: remove all AWS Lambda/S3/SAM infrastructure"
```

**Warning:** The project will NOT compile after this task. `whatsapp.ts` imports from deleted `s3.ts`, and `logger.util.ts` imports deleted functions from `runtime.util.ts`. Tasks 3-6 fix these in order. Do NOT run verification until after Task 6.

---

### Task 3: Simplify runtime utilities — remove Lambda detection

**Files:**
- Modify: `src/utils/runtime.util.ts`

- [ ] **Step 1: Rewrite `runtime.util.ts`**

Remove `isLambda()`, `getLambdaFunctionName()`, `getLambdaFunctionVersion()`, `getLambdaRequestId()`. Keep the `CorrelationContext` class and its exported functions.

Replace the entire file with:

```typescript
import { randomUUID } from 'crypto';

class CorrelationContext {
  private static storage = new Map<string, string>();

  static getCorrelationId(): string | undefined {
    return this.storage.get('correlationId');
  }

  static setCorrelationId(id: string): void {
    this.storage.set('correlationId', id);
  }

  static generateCorrelationId(): string {
    return randomUUID();
  }

  static initializeCorrelationId(): string {
    const existing = this.getCorrelationId();
    if (existing) {
      return existing;
    }

    const newId = this.generateCorrelationId();
    this.setCorrelationId(newId);
    return newId;
  }
}

export function getCorrelationId(): string | undefined {
  return CorrelationContext.getCorrelationId();
}

export function setCorrelationId(id: string): void {
  CorrelationContext.setCorrelationId(id);
}

export function initializeCorrelationId(): string {
  return CorrelationContext.initializeCorrelationId();
}
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/runtime.util.ts
git commit -m "refactor: remove Lambda detection from runtime utils"
```

---

### Task 4: Simplify logger — remove Lambda context enrichment

**Files:**
- Modify: `src/utils/logger.util.ts`

- [ ] **Step 1: Update imports**

Remove `getLambdaFunctionName`, `getLambdaFunctionVersion`, `getLambdaRequestId` from the import. Keep only `getCorrelationId`.

Change:
```typescript
import { getCorrelationId, getLambdaFunctionName, getLambdaFunctionVersion, getLambdaRequestId } from './runtime.util.js';
```
to:
```typescript
import { getCorrelationId } from './runtime.util.js';
```

- [ ] **Step 2: Simplify `getRequestContext()`**

Remove the Lambda function name/version/requestId block. Keep correlationId and memoryUsage.

Replace `getRequestContext()` with:

```typescript
function getRequestContext(): Record<string, unknown> {
  const context: Record<string, unknown> = {};

  const correlationId = getCorrelationId();
  if (correlationId) {
    context.correlationId = correlationId;
  }

  if (process.memoryUsage) {
    const memUsage = process.memoryUsage();
    context.memoryUsage = {
      heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
      rss: Math.round(memUsage.rss / 1024 / 1024),
    };
  }

  return context;
}
```

- [ ] **Step 3: Verify**

```bash
bun run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/utils/logger.util.ts
git commit -m "refactor: remove Lambda context from logger"
```

---

### Task 5: Simplify config — remove dotenv and AWS

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: Rewrite `config.ts`**

Remove `dotenv` import and call, remove `AWSConfig` interface, remove `aws` block, remove `environment` field, remove base64 key decoding branch, hardcode non-secret defaults.

Replace the entire file with:

```typescript
export interface GoogleConfig {
  spreadsheetId: string;
  clientEmail: string | undefined;
  privateKey: string | undefined;
  projectId: string | undefined;
}

export interface WhatsAppConfig {
  groupName: string | undefined;
  healthCheckGroupName: string | undefined;
}

export interface ScheduleConfig {
  timezone: string;
}

export interface AppConfig {
  google: GoogleConfig;
  whatsapp: WhatsAppConfig;
  schedule: ScheduleConfig;
  logging: {
    level: string;
  };
}

/**
 * Normalizes the Google private key from environment variable.
 * Handles escaped newlines from env files (e.g. literal \n -> actual newlines).
 */
function normalizePrivateKey(rawKey: string | undefined): string | undefined {
  if (!rawKey) {
    return undefined;
  }
  return rawKey.replace(/\\n/g, '\n');
}

export const config: AppConfig = {
  google: {
    spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID ?? '',
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL,
    privateKey: normalizePrivateKey(process.env.GOOGLE_PRIVATE_KEY),
    projectId: process.env.GOOGLE_PROJECT_ID,
  },
  whatsapp: {
    groupName: process.env.WHATSAPP_GROUP_NAME,
    healthCheckGroupName: process.env.WHATSAPP_HEALTH_CHECK_GROUP_NAME,
  },
  schedule: {
    timezone: 'America/Los_Angeles',
  },
  logging: {
    level: process.env.LOG_LEVEL ?? 'info',
  },
};
```

- [ ] **Step 2: Verify**

```bash
bun run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/config.ts
git commit -m "refactor: remove dotenv and AWS config, simplify key handling"
```

---

### Task 6: Simplify WhatsApp client — remove S3 sync and Lambda paths

**Files:**
- Modify: `src/clients/whatsapp.ts`

This is the largest single change. Remove all S3 session sync, Lambda-specific QR rejection, and `isLambda()` checks.

- [ ] **Step 1: Rewrite `whatsapp.ts`**

Replace the entire file with:

```typescript
import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  type WASocket,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  type ConnectionState,
} from '@whiskeysockets/baileys';
import baileysLogger from '@whiskeysockets/baileys/lib/Utils/logger.js';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import qrcode from 'qrcode-terminal';
import { config } from '../config.js';
import { QRAuthenticationRequiredError } from '../types.js';
import type { Logger } from '../types.js';

// --- Auth Tracking ---

const AUTH_DIR = 'app-data';
const AUTH_KEY = 'whatsapp-auth.json';
const REMINDER_DAYS = 7;

function getAuthFilePath(): string {
  const dir = join(process.cwd(), AUTH_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return join(dir, AUTH_KEY);
}

function recordAuthentication(): void {
  const filePath = getAuthFilePath();
  writeFileSync(filePath, JSON.stringify({ timestamp: new Date().toISOString() }));
}

export function getAuthAgeDays(): number | null {
  try {
    const filePath = getAuthFilePath();
    if (!existsSync(filePath)) {
      return null;
    }
    const data = JSON.parse(readFileSync(filePath, 'utf-8'));
    const lastAuth = new Date(data.timestamp);
    if (isNaN(lastAuth.getTime())) {
      return null;
    }
    return Math.floor((Date.now() - lastAuth.getTime()) / (1000 * 60 * 60 * 24));
  } catch {
    return null;
  }
}

function checkAuthReminder(logger: Logger): void {
  const daysSince = getAuthAgeDays();
  if (daysSince === null) {
    logger.warn('WhatsApp authentication age unknown — never authenticated or file missing');
    return;
  }
  if (daysSince >= REMINDER_DAYS) {
    logger.warn(`WhatsApp authentication refresh needed! Last auth: ${daysSince} days ago.`);
  }
}

// --- WhatsApp Socket ---

class WhatsAppSocket {
  private sock: WASocket | null = null;
  private isReady = false;
  private isInitializing = false;
  private readonly sessionPath: string;
  private saveCreds: (() => Promise<void>) | null = null;
  private activeGroupId: string | undefined = undefined;
  private readonly groupNameCache = new Map<string, string>();

  constructor() {
    this.sessionPath = join(process.cwd(), 'auth_info');
    if (!existsSync(this.sessionPath)) {
      mkdirSync(this.sessionPath, { recursive: true });
    }
  }

  isClientReady(): boolean {
    return this.isReady && this.sock !== null;
  }

  private shouldIgnoreJid(jid: string): boolean {
    if (this.activeGroupId && jid.includes(this.activeGroupId)) {
      return false;
    }
    if (jid.includes('@s.whatsapp.net') || jid.includes('@lid')) {
      return true;
    }
    if (jid.includes('@g.us')) {
      return true;
    }
    return false;
  }

  async initialize(logger: Logger): Promise<void> {
    if (this.isReady && this.sock) {
      try {
        if (this.sock.user) {
          return;
        }
      } catch {
        this.sock = null;
        this.isReady = false;
      }
    }

    if (this.isInitializing) {
      return new Promise((resolve, reject) => {
        const checkReady = setInterval(() => {
          if (this.isReady && this.sock) {
            clearInterval(checkReady);
            resolve();
          } else if (!this.isInitializing) {
            clearInterval(checkReady);
            reject(new Error('Initialization failed'));
          }
        }, 100);
        setTimeout(() => {
          clearInterval(checkReady);
          reject(new Error('Initialization timeout'));
        }, 180000);
      });
    }

    this.isInitializing = true;

    return new Promise((resolve, reject) => {
      (async () => {
        try {
          if (this.sock) {
            this.sock.end(undefined);
            this.sock = null;
          }

          const { state, saveCreds } = await useMultiFileAuthState(this.sessionPath);
          this.saveCreds = saveCreds;
          const { version } = await fetchLatestBaileysVersion();

          this.sock = makeWASocket({
            version,
            auth: {
              creds: state.creds,
              keys: makeCacheableSignalKeyStore(state.keys, baileysLogger),
            },
            syncFullHistory: false,
            markOnlineOnConnect: false,
            fireInitQueries: false,
            shouldSyncHistoryMessage: () => false,
            getMessage: async () => undefined,
            shouldIgnoreJid: (jid: string) => this.shouldIgnoreJid(jid),
            connectTimeoutMs: 30000,
            defaultQueryTimeoutMs: 30000,
            maxMsgRetryCount: 1,
            retryRequestDelayMs: 1000,
            emitOwnEvents: false,
            generateHighQualityLinkPreview: false,
            linkPreviewImageThumbnailWidth: 0,
          });

          this.sock.ev.on('creds.update', async () => {
            if (this.saveCreds) {
              await this.saveCreds();
            }
          });

          this.setupEvents(logger, resolve, reject);
        } catch (error) {
          this.isInitializing = false;
          this.sock = null;
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      })();
    });
  }

  private setupEvents(logger: Logger, resolve: () => void, reject: (error: Error) => void): void {
    if (!this.sock) {
      reject(new Error('Failed to create WhatsApp socket'));
      return;
    }

    let initTimeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      if (!this.isReady) {
        this.isInitializing = false;
        if (this.sock) {
          this.sock.end(undefined);
          this.sock = null;
        }
        reject(new Error('WhatsApp client initialization timeout'));
      }
    }, 180000);

    const clearInitTimeout = () => {
      if (initTimeout) {
        clearTimeout(initTimeout);
        initTimeout = null;
      }
    };

    this.sock.ev.on('connection.update', (update: Partial<ConnectionState>) => {
      try {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          console.log(`\n${'='.repeat(60)}`);
          console.log('WHATSAPP AUTHENTICATION REQUIRED');
          console.log('='.repeat(60));
          console.log('\nPlease scan the QR code below with your WhatsApp mobile app:');
          console.log('1. Open WhatsApp on your phone');
          console.log('2. Go to Settings > Linked Devices');
          console.log('3. Tap "Link a Device"');
          console.log('4. Scan the QR code below\n');
          qrcode.generate(qr, { small: true });
          console.log('\nWaiting for you to scan the QR code...\n');
        }

        if (connection === 'open') {
          clearInitTimeout();
          this.isReady = true;
          this.isInitializing = false;
          console.log('WhatsApp client is ready!');
          resolve();
        }

        if (connection === 'close') {
          const error = lastDisconnect?.error;
          const statusCode = error &&
            typeof error === 'object' &&
            'output' in error &&
            typeof (error as { output?: { statusCode?: number } }).output === 'object'
            ? (error as { output: { statusCode?: number } }).output?.statusCode
            : undefined;

          if (statusCode === DisconnectReason.loggedOut || statusCode === 401) {
            clearInitTimeout();
            this.isInitializing = false;
            this.isReady = false;
            if (this.sock) {
              this.sock.end(undefined);
              this.sock = null;
            }
            try {
              if (existsSync(this.sessionPath)) {
                rmSync(this.sessionPath, { recursive: true, force: true });
              }
            } catch { /* ignore */ }
            setTimeout(async () => {
              try {
                await this.initialize(logger);
                resolve();
              } catch (e) {
                reject(e instanceof Error ? e : new Error(String(e)));
              }
            }, 1000);
          } else if (statusCode === DisconnectReason.restartRequired) {
            clearInitTimeout();
            this.isInitializing = false;
            this.isReady = false;
            if (this.sock) {
              this.sock.end(undefined);
              this.sock = null;
            }
            setTimeout(async () => {
              try {
                await this.initialize(logger);
                resolve();
              } catch (e) {
                reject(e instanceof Error ? e : new Error(String(e)));
              }
            }, 1000);
          } else {
            this.isReady = false;
          }
        }
      } catch (error) {
        clearInitTimeout();
        this.isInitializing = false;
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  async resolveGroupJid(groupName: string): Promise<string> {
    const cached = this.groupNameCache.get(groupName.toLowerCase());
    if (cached) {
      return cached;
    }

    if (!this.sock || !this.isReady) {
      throw new Error('WhatsApp client is not initialized. Call initialize() first.');
    }

    const groups = await this.sock.groupFetchAllParticipating();

    const matchesByName = new Map<string, string[]>();
    for (const [jid, meta] of Object.entries(groups)) {
      const key = meta.subject.toLowerCase();
      this.groupNameCache.set(key, jid);
      const existing = matchesByName.get(key) ?? [];
      existing.push(jid);
      matchesByName.set(key, existing);
    }

    const targetKey = groupName.toLowerCase();
    const jid = this.groupNameCache.get(targetKey);
    if (!jid) {
      const available = Object.values(groups).map((m) => m.subject).join(', ');
      throw new Error(`No WhatsApp group found with name "${groupName}". Available groups: ${available}`);
    }

    const duplicates = matchesByName.get(targetKey);
    if (duplicates && duplicates.length > 1) {
      throw new Error(
        `Multiple WhatsApp groups found with name "${groupName}": ${duplicates.join(', ')}. Use a unique group name.`,
      );
    }

    if (config.whatsapp.groupName?.toLowerCase() === targetKey) {
      this.activeGroupId = jid;
    }

    return jid;
  }

  async sendToGroup(chatId: string, message: string): Promise<{ id: string }> {
    if (!this.sock || !this.isReady) {
      throw new Error('WhatsApp client is not initialized. Call initialize() first.');
    }

    const normalizedChatId = chatId.includes('@g.us') ? chatId : `${chatId}@g.us`;

    try {
      await this.sock.groupMetadata(normalizedChatId);
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.includes('not found') && !msg.includes('404')) {
        console.warn(`Warning: Could not fetch group metadata: ${msg}`);
      }
    }

    const result = await this.sock.sendMessage(normalizedChatId, { text: message });
    if (!result) {
      throw new Error('Failed to send message: no result returned');
    }
    return { id: result.key.id ?? '' };
  }

  async destroy(logger: Logger): Promise<void> {
    try {
      if (this.sock) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        this.sock.end(undefined);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes('Connection Closed') && !msg.includes('Connection closed') && !msg.includes('Precondition Required')) {
        logger.error('Error during WhatsApp client cleanup', error);
      }
    } finally {
      this.sock = null;
      this.isReady = false;
      this.isInitializing = false;
    }
  }
}

// --- Public API ---

const socket = new WhatsAppSocket();

export async function initialize(logger: Logger): Promise<void> {
  checkAuthReminder(logger);
  await socket.initialize(logger);
  if (config.whatsapp.groupName) {
    await socket.resolveGroupJid(config.whatsapp.groupName);
  }
}

export async function sendMessage(message: string, logger: Logger): Promise<{ id: string }> {
  const groupName = config.whatsapp.groupName;
  if (!groupName) {
    throw new Error('No WhatsApp group name configured. Set WHATSAPP_GROUP_NAME.');
  }
  return sendToGroup(groupName, message, logger);
}

export async function sendToGroup(groupName: string, message: string, logger: Logger): Promise<{ id: string }> {
  let lastError: Error | null = null;
  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (!socket.isClientReady()) {
        throw new Error('Client is not ready');
      }

      const groupJid = await socket.resolveGroupJid(groupName);
      const result = await socket.sendToGroup(groupJid, message);
      logger.info('WhatsApp message sent to group', { groupName, groupJid, messageId: result.id, attempt });
      return { id: result.id };
    } catch (error) {
      if (error instanceof QRAuthenticationRequiredError) {
        throw error;
      }

      lastError = error instanceof Error ? error : new Error(String(error));
      const isProtocolError = lastError.message.includes('Protocol error') ||
        lastError.message.includes('Execution context') ||
        lastError.message.includes('Target closed');

      if (isProtocolError && attempt < maxRetries) {
        logger.warn(`Send attempt ${attempt} failed, retrying...`, { error: lastError.message });
        if (!socket.isClientReady()) {
          await socket.initialize(logger);
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error('Failed to send message after retries');
}

export async function destroy(logger: Logger): Promise<void> {
  recordAuthentication();
  await socket.destroy(logger);
}

export function isAvailable(): boolean {
  return !!config.whatsapp.groupName;
}
```

Key changes from original:
- Removed `FileStorage` / S3 imports and all S3 sync functions
- Removed `isLambda()` import and all Lambda conditional branches
- Auth tracking now uses local filesystem directly (no S3 fallback)
- `checkAuthReminder` runs for all environments (was Lambda-only)
- `recordAuthentication` writes to local disk directly (was async with Lambda branch)
- Session path is always `process.cwd()/auth_info` (no `/tmp` Lambda path)
- Removed Lambda QR rejection branch (QR always displayed for scanning)
- `destroy()` no longer syncs to S3

- [ ] **Step 2: Verify**

```bash
bun run typecheck
bun run lint
```

- [ ] **Step 3: Commit**

```bash
git add src/clients/whatsapp.ts
git commit -m "refactor: remove S3 sync and Lambda paths from WhatsApp client"
```

---

### Task 7: Simplify entry point

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Rewrite `src/index.ts`**

Remove Lambda detection. Simplify to a clean entry point.

```typescript
import { runBirthdayCheck } from './services/birthday.js';
import { logger } from './utils/logger.util.js';
import { setCorrelationId } from './utils/runtime.util.js';

async function main(): Promise<void> {
  const correlationId = `mnemora-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  setCorrelationId(correlationId);

  logger.info('Birthday check started', { correlationId });

  try {
    await runBirthdayCheck(logger);
    logger.info('Birthday check completed successfully', { correlationId });
    process.exit(0);
  } catch (error) {
    logger.error('Birthday check failed', error, { correlationId });
    process.exit(1);
  }
}

main();
```

Only change: `local-` prefix replaced with `mnemora-` (no longer "local" vs "lambda").

- [ ] **Step 2: Verify**

```bash
bun run typecheck
bun run lint
```

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "refactor: simplify entry point, remove local- prefix"
```

---

### Task 8: Update tsconfig for Bun

**Files:**
- Modify: `tsconfig.json`

- [ ] **Step 1: Update tsconfig.json**

Add Bun types, keep strict settings. Remove `declaration`, `declarationMap`, `sourceMap` (not building for distribution). Keep `incremental` for fast typechecks.

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "lib": ["ES2023"],
    "moduleResolution": "bundler",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "isolatedModules": true,
    "incremental": true,
    "tsBuildInfoFile": "./.tsbuildinfo",
    "types": ["bun-types"]
  },
  "include": [
    "src/**/*.ts",
    "src/types/**/*.d.ts"
  ],
  "exclude": [
    "node_modules",
    "dist",
    "**/*.js"
  ]
}
```

Changes:
- `moduleResolution`: `node` → `bundler` (Bun prefers this)
- Removed: `declaration`, `declarationMap`, `sourceMap` (not needed — not publishing)
- Added: `"types": ["bun-types"]`

- [ ] **Step 2: Install bun-types**

```bash
bun add -d bun-types
```

- [ ] **Step 3: Verify**

```bash
bun run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json package.json bun.lock
git commit -m "build: configure tsconfig for Bun runtime"
```

---

### Task 9: Update release script for Bun

**Files:**
- Modify: `src/scripts/release.ts`

- [ ] **Step 1: Update deploy reference in release script**

In `release.ts`, find the "Next steps" output near the end (around line 563):

Change:
```typescript
      console.log('2. Deploy to production: yarn deploy');
```
to:
```typescript
      console.log('2. Pull on Pi to deploy: git pull && bun install');
```

- [ ] **Step 2: Verify**

```bash
bun run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/scripts/release.ts
git commit -m "refactor: update release script deploy instructions for Pi"
```

---

### Task 10: Create 1Password template and systemd units

**Files:**
- Create: `.env.tpl`
- Create: `systemd/mnemora.service`
- Create: `systemd/mnemora.timer`

- [ ] **Step 1: Create `.env.tpl`**

```bash
GOOGLE_CLIENT_EMAIL=op://Private/Mnemora/GOOGLE_CLIENT_EMAIL
GOOGLE_PRIVATE_KEY=op://Private/Mnemora/GOOGLE_PRIVATE_KEY
GOOGLE_PROJECT_ID=op://Private/Mnemora/GOOGLE_PROJECT_ID
GOOGLE_SPREADSHEET_ID=op://Private/Mnemora/GOOGLE_SPREADSHEET_ID
WHATSAPP_GROUP_NAME=op://Private/Mnemora/WHATSAPP_GROUP_NAME
```

- [ ] **Step 2: Create `systemd/mnemora.service`**

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

- [ ] **Step 3: Create `systemd/mnemora.timer`**

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

- [ ] **Step 4: Commit**

```bash
git add .env.tpl systemd/
git commit -m "feat: add 1Password env template and systemd units"
```

---

### Task 11: Create PHILOSOPHY.md

**Files:**
- Create: `PHILOSOPHY.md`

- [ ] **Step 1: Write PHILOSOPHY.md**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add PHILOSOPHY.md
git commit -m "docs: add PHILOSOPHY.md adapted from sf-human"
```

---

### Task 12: Update AGENTS.md

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Rewrite AGENTS.md**

Replace the entire file with updated content reflecting the new stack:

```markdown
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
```

- [ ] **Step 2: Verify nothing references removed files**

```bash
grep -r "lambda\|s3\.js\|s3\.ts\|deploy\.sh\|sam\|infrastructure/" src/ --include="*.ts" || echo "No stale references"
```

- [ ] **Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: update AGENTS.md for Pi/Bun/Biome/1Password stack"
```

---

### Task 13: Update README.md

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Rewrite README.md**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: update README for Pi deployment"
```

---

### Task 14: Delete .env file and update .gitignore for .env.tpl

**Files:**
- Delete: `.env` (if exists)
- Modify: `.gitignore`

- [ ] **Step 1: Trash .env if it exists**

```bash
test -f .env && trash-put .env || echo "No .env file to remove"
```

- [ ] **Step 2: Ensure `.env.tpl` is NOT in .gitignore**

Check that `.gitignore` doesn't catch `.env.tpl` (it shouldn't — the existing patterns are `.env`, `.env.local`, `.env.*.local`). The `.env.tpl` file should be tracked.

- [ ] **Step 3: Commit if .env was removed from tracking**

If `.env` was tracked (unlikely — it's gitignored), commit its removal. Otherwise, skip.

---

### Task 15: Run Biome format on entire codebase and fix lint issues

**Files:**
- Modify: all `src/**/*.ts` files (formatting changes)

- [ ] **Step 1: Run biome check with auto-fix**

```bash
bun run check
```

This formats and fixes all lint-safe issues across the codebase.

- [ ] **Step 2: Review and manually fix any remaining lint errors**

```bash
bun run lint
```

If there are errors biome can't auto-fix (e.g., `noExplicitAny`), fix them manually. The main known issue: `whatsapp.ts` has a cast `(error as { output: ... })` which may trigger.

- [ ] **Step 3: Verify everything passes**

```bash
bun run typecheck && bun run lint && echo "All checks pass"
```

- [ ] **Step 4: Commit**

```bash
git add -u
git commit -m "style: format codebase with Biome"
```

---

### Task 16: Final cleanup and verification

**Files:**
- Possibly modify: `.gitignore`, any remaining stale references

- [ ] **Step 1: Check for stale references to removed infrastructure**

```bash
grep -rn "aws\|lambda\|Lambda\|dotenv\|s3Client\|S3\|SAM\|yarn\|eslint\|ESLint" src/ --include="*.ts" | grep -v node_modules || echo "Clean"
```

Review any hits. Some are legitimate (e.g., `@g.us` contains "us", AWS in comments). Fix anything that's actually a stale reference.

- [ ] **Step 2: Check for orphaned type declarations**

```bash
ls src/types/
```

`qrcode-terminal.d.ts` should still exist (Baileys depends on it). Confirm no other orphaned `.d.ts` files.

- [ ] **Step 3: Full verification**

```bash
bun run typecheck && bun run lint && echo "Migration complete — all checks pass"
```

- [ ] **Step 4: Commit any final cleanup**

```bash
git add -u
git commit -m "chore: final migration cleanup"
```

- [ ] **Step 5: Review full diff from main**

```bash
git diff main...HEAD --stat
```

Confirm: all AWS/Lambda/S3/ESLint files removed, new biome/systemd/philosophy files added, all source files simplified.
