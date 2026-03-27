import type { BirthdayRecord } from '../types.js';
import { parseDateString } from './date-helpers.util.js';
import { extractNameParts, sanitizeNames } from './name-helpers.util.js';

export function parseRowToBirthdays(row: string[]): BirthdayRecord[] {
  const birthdays: BirthdayRecord[] = [];

  // Try sequential pairs first (original format: Name, Date, Name, Date, ...)
  for (let i = 0; i < row.length - 1; i += 2) {
    const name = row[i]?.trim();
    const dateStr = row[i + 1]?.trim();
    if (!name || !dateStr) {
      continue;
    }
    const birthday = parseDateString(dateStr);
    if (!birthday) {
      continue;
    }
    const nameParts = extractNameParts(name);
    const { firstName, lastName } = sanitizeNames(nameParts.firstName, nameParts.lastName);
    const record: BirthdayRecord = { firstName, birthday };
    if (lastName) {
      record.lastName = lastName;
    }
    birthdays.push(record);
  }

  // If we found birthdays with sequential pairs, return them
  if (birthdays.length > 0) {
    return birthdays;
  }

  // Otherwise, try adjacent pairs (format: ..., Name, Date, ...)
  // This handles the case where the sheet is organized by month columns
  // and names/dates appear in adjacent cells anywhere in the row
  for (let i = 0; i < row.length - 1; i++) {
    const name = row[i]?.trim();
    const dateStr = row[i + 1]?.trim();

    // Skip if either is empty or if name looks like a month name
    if (!name || !dateStr) {
      continue;
    }

    // Skip if name is a month name (header row) — case insensitive
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
      'jan',
      'feb',
      'mar',
      'apr',
      'may',
      'jun',
      'jul',
      'aug',
      'sep',
      'oct',
      'nov',
      'dec',
    ];
    if (monthNames.includes(name.toLowerCase())) {
      continue;
    }

    const birthday = parseDateString(dateStr);
    if (!birthday) {
      continue;
    }

    const nameParts = extractNameParts(name);
    const { firstName, lastName } = sanitizeNames(nameParts.firstName, nameParts.lastName);
    const record: BirthdayRecord = { firstName, birthday };
    if (lastName) {
      record.lastName = lastName;
    }
    birthdays.push(record);
  }

  return birthdays;
}
