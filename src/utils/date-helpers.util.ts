import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
import { config } from '../config.js';

dayjs.extend(utc);
dayjs.extend(timezone);

function getTimezone(): string {
  return config.schedule.timezone;
}

function createDateInTimezone(year: number, month: number, day: number): Date {
  const tz = getTimezone();
  // Create a date at midnight in the target timezone directly using dayjs
  // Parse the date string in the target timezone (not system timezone)
  // This prevents day shifts when converting between timezones
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  // dayjs.tz(dateStr, tz) parses the date string as if it's in the target timezone
  // This ensures Nov 21 stays Nov 21 in the configured timezone
  return dayjs.tz(dateStr, tz).startOf('day').toDate();
}

export function today(): Date {
  const tz = getTimezone();
  const now = new Date();
  // Get the current date in the configured timezone
  const zonedDate = dayjs(now).tz(tz);
  // Create a date at midnight in the configured timezone
  // This ensures the date represents the correct calendar day in the target timezone
  return zonedDate.startOf('day').toDate();
}

function createDate(month: number, day: number, year?: number): Date {
  const currentYear = year ?? today().getFullYear();
  return createDateInTimezone(currentYear, month, day);
}

function createDateFromMonthName(monthName: string, day: number, year?: number): Date | null {
  const monthNames = [
    'january',
    'february',
    'march',
    'april',
    'may',
    'june',
    'july',
    'august',
    'september',
    'october',
    'november',
    'december',
  ];
  const input = monthName.toLowerCase();

  // Try exact match first
  let monthIndex = monthNames.indexOf(input);

  // Then try prefix match, but only if input is at least 3 chars (standard abbreviation)
  if (monthIndex === -1 && input.length >= 3) {
    monthIndex = monthNames.findIndex((m) => m.startsWith(input));
  }

  if (monthIndex === -1) {
    return null;
  }

  return createDate(monthIndex + 1, day, year);
}

export function parseDateString(dateStr: string): Date | null {
  const trimmed = dateStr.trim();

  const abbreviatedMonthMatch = trimmed.match(/^([A-Za-z]{3,})\s+(\d{1,2})$/);
  if (abbreviatedMonthMatch) {
    const monthName = abbreviatedMonthMatch[1];
    const day = parseInt(abbreviatedMonthMatch[2], 10);
    const date = createDateFromMonthName(monthName, day);
    if (date) {
      return date;
    }
  }

  const fullMonthMatch = trimmed.match(/^([A-Za-z]+)\s+(\d{1,2})(?:,\s*(\d{4}))?$/);
  if (fullMonthMatch) {
    const monthName = fullMonthMatch[1];
    const day = parseInt(fullMonthMatch[2], 10);
    const year = fullMonthMatch[3] ? parseInt(fullMonthMatch[3], 10) : undefined;
    const date = createDateFromMonthName(monthName, day, year);
    if (date) {
      return date;
    }
  }

  const isoMatch = trimmed.match(/^(\d{4}-)?(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const year = isoMatch[1] ? parseInt(isoMatch[1].replace('-', ''), 10) : undefined;
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    return createDate(month, day, year);
  }

  return null;
}

export function formatDateShort(date: Date, includeYear = false): string {
  const tz = getTimezone();
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    timeZone: tz,
  };
  if (includeYear) {
    options.year = 'numeric';
  }
  return date.toLocaleDateString('en-US', options);
}

export function isFirstDayOfMonth(date: Date): boolean {
  return getDateInTimezone(date) === 1;
}

/**
 * Get the month (1-12) of a date in the configured timezone.
 * This ensures we extract date components correctly regardless of system timezone.
 */
export function getMonthInTimezone(date: Date): number {
  const tz = getTimezone();
  const zonedDate = dayjs(date).tz(tz);
  return zonedDate.month() + 1; // dayjs months are 0-indexed, return 1-12
}

/**
 * Get the day of month (1-31) of a date in the configured timezone.
 * This ensures we extract date components correctly regardless of system timezone.
 */
export function getDateInTimezone(date: Date): number {
  const tz = getTimezone();
  const zonedDate = dayjs(date).tz(tz);
  return zonedDate.date(); // dayjs.date() returns 1-31
}

/**
 * Format a timestamp in a human-readable format in the configured timezone.
 * Example: "Nov 20, 2025 at 8:18 AM PST" or "Nov 20, 2025 at 9:18 AM PDT"
 */
export function formatTimestampHumanReadable(timestamp: string | Date): string {
  const tz = getTimezone();
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const zonedDate = dayjs(date).tz(tz);

  // Format: "Nov 20, 2025 at 8:18 AM PST"
  return zonedDate.format('MMM D, YYYY [at] h:mm A z');
}
