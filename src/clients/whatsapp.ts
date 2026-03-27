import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import makeWASocket, {
  type ConnectionState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type WASocket,
} from '@whiskeysockets/baileys';
import baileysLogger from '@whiskeysockets/baileys/lib/Utils/logger.js';
import qrcode from 'qrcode-terminal';
import { config } from '../config.js';
import type { Logger } from '../types.js';
import { QRAuthenticationRequiredError } from '../types.js';

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
    if (Number.isNaN(lastAuth.getTime())) {
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
          const statusCode =
            error &&
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
            } catch {
              /* ignore */
            }
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
      const available = Object.values(groups)
        .map((m) => m.subject)
        .join(', ');
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
      if (
        !msg.includes('Connection Closed') &&
        !msg.includes('Connection closed') &&
        !msg.includes('Precondition Required')
      ) {
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
      const isProtocolError =
        lastError.message.includes('Protocol error') ||
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
