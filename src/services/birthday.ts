import * as googleSheets from '../clients/googleSheets.js';
import * as whatsapp from '../clients/whatsapp.js';
import { getFullName } from '../utils/name-helpers.util.js';
import {
  today,
  formatDateShort,
  isFirstDayOfMonth,
  getMonthInTimezone,
  getDateInTimezone,
  formatTimestampHumanReadable,
} from '../utils/date-helpers.util.js';
import { config } from '../config.js';
import { initializeCorrelationId } from '../utils/runtime.util.js';
import type { Logger, BirthdayRecord } from '../types.js';

// --- Message formatting ---

function formatMonthlyDigest(birthdays: BirthdayRecord[]): string | null {
  if (birthdays.length === 0) {
    return null;
  }

  const sorted = [...birthdays].sort((a, b) => a.birthday.getTime() - b.birthday.getTime());
  const byDate = sorted.reduce<Record<string, string[]>>((acc, r) => {
    const key = formatDateShort(r.birthday);
    const names = acc[key] ?? [];
    acc[key] = names;
    names.push(getFullName(r.firstName, r.lastName));
    return acc;
  }, {});

  const dates = Object.keys(byDate);
  const maxWidth = Math.max(...dates.map(d => `${d}: `.length));
  const lines = dates.map(d => `${`${d}: `.padEnd(maxWidth)}${byDate[d].join(', ')}`);

  const monthName = today().toLocaleString('en-US', { month: 'long', timeZone: config.schedule.timezone });
  return `${monthName} birthdays 🎂\n\n${lines.join('\n')}`;
}

function formatBirthdayMessages(birthdays: BirthdayRecord[]): string | null {
  if (birthdays.length === 0) {
    return null;
  }
  if (birthdays.length === 1) {
    return `Happy birthday ${birthdays[0].firstName}! 🎂`;
  }

  const names = birthdays.map(r => r.firstName);
  const combined =
    names.length === 2
      ? `${names[0]} and ${names[1]}`
      : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
  return `Happy birthday ${combined}! 🎂`;
}

function formatHealthCheckMessage(birthdayCount: number, authAgeDays: number | null): string {
  const now = new Date();
  const lines = [
    'Mnemora Health Check',
    `Status: OK`,
    `Time: ${formatTimestampHumanReadable(now)}`,
    `Auth age: ${authAgeDays !== null ? `${authAgeDays} day${authAgeDays !== 1 ? 's' : ''}` : 'unknown'}`,
    `Birthdays today: ${birthdayCount}`,
  ];
  return lines.join('\n');
}

// --- Birthday fetching ---

async function getTodaysBirthdaysWithOptionalDigest(): Promise<{
  todaysBirthdays: BirthdayRecord[];
  monthlyBirthdays?: BirthdayRecord[];
}> {
  const allBirthdays = await googleSheets.fetchBirthdays();
  const todayDate = today();
  const todayMonth = getMonthInTimezone(todayDate);
  const todayDay = getDateInTimezone(todayDate);

  const todaysBirthdays = allBirthdays.filter(
    (r) => getMonthInTimezone(r.birthday) === todayMonth
        && getDateInTimezone(r.birthday) === todayDay,
  );

  if (isFirstDayOfMonth(todayDate)) {
    const monthlyBirthdays = allBirthdays.filter(
      (r) => getMonthInTimezone(r.birthday) === todayMonth,
    );
    return { todaysBirthdays, monthlyBirthdays };
  }

  return { todaysBirthdays };
}

// --- Main entry point ---

export async function runBirthdayCheck(logger: Logger): Promise<void> {
  initializeCorrelationId();

  try {
    logger.info('Running birthday check...');

    if (!config.whatsapp.groupName) {
      throw new Error('WHATSAPP_GROUP_NAME is not configured. Cannot send birthday messages.');
    }

    const { todaysBirthdays, monthlyBirthdays } = await getTodaysBirthdaysWithOptionalDigest();

    await whatsapp.initialize(logger);

    try {
      // Always send health check to monitoring group
      const healthCheckGroupName = config.whatsapp.healthCheckGroupName;
      if (healthCheckGroupName) {
        try {
          const authAgeDays = await whatsapp.getAuthAgeDays();
          const healthMessage = formatHealthCheckMessage(todaysBirthdays.length, authAgeDays);
          logger.info('Sending health check...');
          const result = await whatsapp.sendToGroup(healthCheckGroupName, healthMessage, logger);
          logger.info('Health check sent', { messageId: result.id });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          logger.warn('Health check failed, continuing with birthday messages', { error: msg });
        }
      }

      if (todaysBirthdays.length > 0) {
        logger.info(`Found ${todaysBirthdays.length} birthday(s) today`, {
          birthdays: todaysBirthdays.map((r) => getFullName(r.firstName, r.lastName)),
        });

        const message = formatBirthdayMessages(todaysBirthdays);
        if (message) {
          logger.info('Sending birthday message...', { message });
          const result = await whatsapp.sendMessage(message, logger);
          logger.info('Birthday message sent', { messageId: result.id });
        }
      }

      if (monthlyBirthdays) {
        const digest = formatMonthlyDigest(monthlyBirthdays);
        if (digest) {
          logger.info('Sending monthly digest...', { digest });
          const result = await whatsapp.sendMessage(digest, logger);
          logger.info('Monthly digest sent', { messageId: result.id });
        }
      }

      logger.info('Birthday check completed successfully!');
    } finally {
      await whatsapp.destroy(logger);
    }
  } catch (error) {
    logger.error('Error in birthday check', error);
    throw error;
  }
}
