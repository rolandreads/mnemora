import { google, type sheets_v4 } from 'googleapis';
import { config } from '../config.js';
import type { BirthdayRecord } from '../types.js';
import { parseRowToBirthdays } from '../utils/birthday-helpers.util.js';

let sheetsClient: sheets_v4.Sheets | null = null;
let cachedSheetName: string | null = null;
let resolvedSpreadsheetId: string | null = null;

function getClient(): sheets_v4.Sheets {
  if (sheetsClient) {
    return sheetsClient;
  }

  const { clientEmail, privateKey, spreadsheetId } = config.google;
  if (!clientEmail || !privateKey) {
    throw new Error('Google Sheets credentials not configured. Set GOOGLE_CLIENT_EMAIL and GOOGLE_PRIVATE_KEY.');
  }
  if (!spreadsheetId) {
    throw new Error('Google Sheets spreadsheet ID not configured. Set GOOGLE_SPREADSHEET_ID.');
  }

  resolvedSpreadsheetId = spreadsheetId;

  const auth = new google.auth.JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

async function getFirstSheetName(): Promise<string> {
  if (cachedSheetName) {
    return cachedSheetName;
  }

  const client = getClient();
  const response = await client.spreadsheets.get({ spreadsheetId: resolvedSpreadsheetId! });
  const sheets = response.data.sheets;
  if (!sheets || sheets.length === 0) {
    throw new Error('No sheets found in spreadsheet');
  }

  cachedSheetName = sheets[0]?.properties?.title ?? 'Sheet1';
  return cachedSheetName;
}

export async function fetchBirthdays(): Promise<BirthdayRecord[]> {
  const client = getClient();
  const sheetName = await getFirstSheetName();

  const response = await client.spreadsheets.values.get({
    spreadsheetId: resolvedSpreadsheetId!,
    range: sheetName,
  });

  const rows = response.data.values;
  if (!rows || rows.length === 0) {
    return [];
  }

  // Skip header row
  return rows.slice(1).flatMap((row) => parseRowToBirthdays(row));
}
