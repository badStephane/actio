import * as XLSX from 'xlsx';
import { ImportableContact } from './contacts';

export interface ParsedContactRow {
  rowNumber: number;
  raw: Record<string, unknown>;
  data?: ImportableContact;
  error?: string;
  duplicate?: boolean;
}

export interface ContactParseResult {
  total: number;
  valid: ParsedContactRow[];
  invalid: ParsedContactRow[];
  duplicates: ParsedContactRow[];
}

const normalize = (s: string): string =>
  s.toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s_'`-]+/g, '')
    .trim();

const COLUMN_ALIASES: Record<keyof ImportableContact, string[]> = {
  lastName: ['nom', 'lastname', 'last', 'surname'],
  firstName: ['prenom', 'prenoms', 'firstname', 'first', 'givenname'],
  phone: ['telephone', 'tel', 'phone', 'mobile', 'numero', 'gsm', 'contact'],
  address: ['adresse', 'address', 'localisation', 'lieu', 'quartier'],
  source: ['source', 'origine', 'liste'],
};

const findValue = (row: Record<string, unknown>, aliases: string[]): unknown => {
  const normalizedKeys: Record<string, string> = {};
  for (const key of Object.keys(row)) normalizedKeys[normalize(key)] = key;
  for (const alias of aliases) {
    const k = normalizedKeys[alias];
    if (k !== undefined) return row[k];
  }
  return undefined;
};

const PHONE_DIGITS = /\d/g;

const dupKey = (lastName: string, firstName: string, phone: string): string =>
  `${normalize(lastName)}|${normalize(firstName)}|${phone.replace(/\D/g, '')}`;

const validateRow = (
  raw: Record<string, unknown>,
  rowNumber: number,
  source: string | undefined,
  existingKeys: Set<string>,
  newKeys: Set<string>
): ParsedContactRow => {
  const lastName = String(findValue(raw, COLUMN_ALIASES.lastName) ?? '').trim();
  const firstName = String(findValue(raw, COLUMN_ALIASES.firstName) ?? '').trim();
  const phone = String(findValue(raw, COLUMN_ALIASES.phone) ?? '').trim();
  const address = String(findValue(raw, COLUMN_ALIASES.address) ?? '').trim();
  const sourceFromRow = String(findValue(raw, COLUMN_ALIASES.source) ?? '').trim();

  if (!lastName && !firstName && !phone && !address) {
    return { rowNumber, raw, error: 'Ligne vide' };
  }
  if (!lastName) return { rowNumber, raw, error: 'Nom manquant' };
  if (!firstName) return { rowNumber, raw, error: 'Prénom manquant' };
  if (!phone) return { rowNumber, raw, error: 'Téléphone manquant' };
  const phoneDigits = (phone.match(PHONE_DIGITS) || []).length;
  if (phoneDigits < 6) {
    return { rowNumber, raw, error: 'Téléphone invalide (au moins 6 chiffres)' };
  }

  const data: ImportableContact = {
    lastName,
    firstName,
    phone,
    address,
    source: sourceFromRow || source,
  };

  const key = dupKey(lastName, firstName, phone);
  if (existingKeys.has(key) || newKeys.has(key)) {
    return { rowNumber, raw, data, duplicate: true };
  }
  newKeys.add(key);

  return { rowNumber, raw, data };
};

export const parseContactsFile = async (
  file: File
): Promise<Record<string, unknown>[]> => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: false, raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  });

  if (rows.length === 0) return [];

  // If headers don't include any expected column, fallback to positional
  // mapping using the user's stated format: N | Nom | Prénom | Adresse | Téléphone
  const firstKeys = Object.keys(rows[0]).map(normalize);
  const hasKnownHeader = firstKeys.some(k =>
    Object.values(COLUMN_ALIASES).flat().includes(k)
  );

  if (hasKnownHeader) return rows;

  // Re-read as raw arrays for positional mapping
  const arrays = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
  });

  return arrays.map(arr => {
    const a = arr as unknown[];
    return {
      // skip a[0] (the index column N)
      Nom: a[1] ?? '',
      'Prénom': a[2] ?? '',
      Adresse: a[3] ?? '',
      'Téléphone': a[4] ?? '',
    };
  });
};

export const validateContactRows = (
  rows: Record<string, unknown>[],
  existingKeys: Set<string>,
  source?: string
): ContactParseResult => {
  const newKeys = new Set<string>();
  const valid: ParsedContactRow[] = [];
  const invalid: ParsedContactRow[] = [];
  const duplicates: ParsedContactRow[] = [];

  rows.forEach((raw, i) => {
    const result = validateRow(raw, i + 2, source, existingKeys, newKeys);
    // Skip silently empty rows (no error reporting)
    if (result.error === 'Ligne vide') return;
    if (result.error) invalid.push(result);
    else if (result.duplicate) duplicates.push(result);
    else valid.push(result);
  });

  return { total: rows.length, valid, invalid, duplicates };
};
