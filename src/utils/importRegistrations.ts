import * as XLSX from 'xlsx';
import { Activity, Registration } from '../types';
import { parseAmountXof } from './amount';
import { isRealDate, isValidIsoDate, todayLocalIso, toIsoDateString } from './dates';
import { personKey } from './phone';
import { readWorkbook } from './spreadsheet';

export type ImportableRegistration = Omit<Registration, 'id' | 'createdAt'>;

/** Colonnes dont l'absence change le résultat en silence : le Front exige une confirmation. */
export type ExpectedColumn = 'amount' | 'paymentType' | 'registrationDate';

export interface ParsedRow {
  rowNumber: number;
  raw: Record<string, unknown>;
  data?: ImportableRegistration;
  /** Montant lu (0 s'il est illisible : voir errors). */
  amount: number;
  errors: string[];
  /** Première erreur (compatibilité de l'aperçu existant). */
  error?: string;
  duplicate?: boolean;
}

export interface ParseResult {
  total: number;
  valid: ParsedRow[];
  invalid: ParsedRow[];
  duplicates: ParsedRow[];
  missingColumns: ExpectedColumn[];
  unrecognizedHeaders: string[];
  /** Somme des montants des lignes valides (celles qui seront importées). */
  totalAmount: number;
}

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 5000;
export const MAX_NAME_LENGTH = 100;
export const MAX_ADDRESS_LENGTH = 200;
const MIN_PHONE_DIGITS = 8;
const HEADER_ROW_OFFSET = 2; // la ligne 1 du tableur est l'en-tête

/** Minuscules, sans accents, sans espaces, ponctuation d'en-tête ni apostrophes (droite ou typographique). */
export const normalizeHeader = (s: string): string =>
  s
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s_'’`().:/-]+/g, '')
    .trim();

type Field = 'lastName' | 'firstName' | 'phone' | 'address' | 'amount' | 'paymentType' | 'registrationDate';

/** Alias normalisés, y compris les en-têtes de notre propre export (excelExport.ts). */
const COLUMN_ALIASES: Record<Field, string[]> = {
  lastName: ['nom', 'lastname', 'last', 'nomdefamille'],
  firstName: ['prenoms', 'prenom', 'firstname', 'first'],
  phone: ['telephone', 'tel', 'phone', 'mobile', 'numero', 'gsm', 'contact'],
  address: ['adresse', 'address', 'localisation', 'lieu', 'quartier'],
  amount: ['montant', 'montantfcfa', 'montantf', 'montantxof', 'amount', 'prix', 'somme'],
  paymentType: [
    'typedepaiement',
    'typepaiement',
    'modepaiement',
    'modedepaiement',
    'moyendepaiement',
    'paiement',
    'mode',
    'payment',
    'paymenttype',
  ],
  registrationDate: ['datedinscription', 'dateinscription', 'date', 'registrationdate'],
};

/** En-têtes connus de notre export, volontairement ignorés à l'import. */
const IGNORED_HEADERS = ['activite', 'datedecreation', 'n', 'no', 'num'];

/** Colonnes lues en valeur brute (nombre Excel) ; les autres en texte affiché (garde le 0 initial). */
const RAW_FIELDS: Field[] = ['amount', 'registrationDate'];

const FIELD_BY_ALIAS = new Map<string, Field>(
  (Object.entries(COLUMN_ALIASES) as [Field, string[]][]).flatMap(([field, aliases]) =>
    aliases.map((alias): [string, Field] => [alias, field])
  )
);

const fieldOfHeader = (header: string): Field | undefined => FIELD_BY_ALIAS.get(normalizeHeader(header));

const findValue = (row: Record<string, unknown>, field: Field): unknown => {
  const key = Object.keys(row).find((k) => fieldOfHeader(k) === field);
  return key === undefined ? undefined : row[key];
};

const isBlank = (v: unknown): boolean => v === undefined || v === null || String(v).trim() === '';

const PAYMENT_VALUES: Record<string, Registration['paymentType']> = {
  cash: 'cash',
  espece: 'cash',
  especes: 'cash',
  liquide: 'cash',
  wave: 'wave',
  orangemoney: 'orange_money',
  orange: 'orange_money',
  om: 'orange_money',
};

export const parsePaymentType = (raw: unknown): Registration['paymentType'] | null =>
  PAYMENT_VALUES[normalizeHeader(String(raw ?? ''))] ?? null;

const DMY_DATE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

/**
 * Date d'inscription ISO, ou null si illisible.
 * - nombre : numéro de série Excel, converti par SSF (sans effet de fuseau) ;
 * - chaîne : uniquement 'AAAA-MM-JJ' ou 'jj/mm/aaaa' (séparateurs / . -), jour réel exigé.
 */
export const toIsoDate = (raw: unknown): string | null => {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 1) return null;
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (!parsed || !isRealDate(parsed.y, parsed.m, parsed.d)) return null;
    return toIsoDateString(parsed.y, parsed.m, parsed.d);
  }
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (isValidIsoDate(s)) return s;
  const m = DMY_DATE.exec(s);
  if (!m) return null;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return isRealDate(year, month, day) ? toIsoDateString(year, month, day) : null;
};

interface ValidateContext {
  activity: Activity;
  present: Set<Field>;
  existingKeys: Set<string>;
  newKeys: Set<string>;
}

const readText = (raw: Record<string, unknown>, field: Field): string =>
  String(findValue(raw, field) ?? '').trim();

const checkIdentity = (lastName: string, firstName: string, phone: string, address: string): string[] => {
  const errors: string[] = [];
  if (!lastName) errors.push('Nom manquant');
  if (!firstName) errors.push('Prénoms manquant');
  if (lastName.length > MAX_NAME_LENGTH || firstName.length > MAX_NAME_LENGTH) {
    errors.push(`Nom ou prénoms trop long (${MAX_NAME_LENGTH} caractères maximum)`);
  }
  if (!phone) errors.push('Téléphone manquant');
  else if (phone.replace(/\D/g, '').length < MIN_PHONE_DIGITS) {
    errors.push(`Téléphone invalide (au moins ${MIN_PHONE_DIGITS} chiffres)`);
  }
  if (!address) errors.push('Adresse manquante');
  else if (address.length > MAX_ADDRESS_LENGTH) {
    errors.push(`Adresse trop longue (${MAX_ADDRESS_LENGTH} caractères maximum)`);
  }
  return errors;
};

/** Montant : cellule vide = montant par défaut de l'activité s'il existe ; valeur illisible = erreur. */
const readAmount = (raw: Record<string, unknown>, activity: Activity): { amount: number; error?: string } => {
  const cell = findValue(raw, 'amount');
  if (isBlank(cell)) {
    return activity.defaultAmount !== undefined
      ? { amount: activity.defaultAmount }
      : { amount: 0, error: "Montant manquant (et l'activité n'a pas de montant par défaut)" };
  }
  const amount = parseAmountXof(cell);
  return amount === null
    ? { amount: 0, error: `Montant illisible : « ${String(cell)} » (entier en F CFA attendu, ex. 5000 ou 5 000)` }
    : { amount };
};

/** Paiement : colonne absente = espèces (signalé par missingColumns) ; cellule vide ou inconnue = erreur. */
const readPayment = (raw: Record<string, unknown>, ctx: ValidateContext): { value?: Registration['paymentType']; error?: string } => {
  if (!ctx.present.has('paymentType')) return { value: 'cash' };
  const cell = findValue(raw, 'paymentType');
  if (isBlank(cell)) return { error: 'Mode de paiement manquant' };
  const value = parsePaymentType(cell);
  return value
    ? { value }
    : { error: `Mode de paiement inconnu : « ${String(cell)} » (espèce, wave ou orange money)` };
};

/** Date : colonne absente ou cellule vide = aujourd'hui (heure locale) ; valeur illisible = erreur. */
const readDate = (raw: Record<string, unknown>): { value?: string; error?: string } => {
  const cell = findValue(raw, 'registrationDate');
  if (isBlank(cell)) return { value: todayLocalIso() };
  const value = toIsoDate(cell);
  return value
    ? { value }
    : { error: `Date illisible : « ${String(cell)} » (formats acceptés : 15/05/2026 ou 2026-05-15)` };
};

const validateRow = (raw: Record<string, unknown>, rowNumber: number, ctx: ValidateContext): ParsedRow => {
  const lastName = readText(raw, 'lastName');
  const firstName = readText(raw, 'firstName');
  const phone = readText(raw, 'phone');
  const address = readText(raw, 'address');
  const amount = readAmount(raw, ctx.activity);
  const payment = readPayment(raw, ctx);
  const date = readDate(raw);

  const errors = [
    ...checkIdentity(lastName, firstName, phone, address),
    ...[amount.error, payment.error, date.error].filter((e): e is string => e !== undefined),
  ];
  if (errors.length > 0 || !payment.value || !date.value) {
    return { rowNumber, raw, amount: amount.amount, errors, error: errors[0] };
  }

  const data: ImportableRegistration = {
    lastName,
    firstName,
    phone,
    address,
    amount: amount.amount,
    paymentType: payment.value,
    registrationDate: date.value,
    activityId: ctx.activity.id,
  };
  const key = personKey(lastName, firstName, phone);
  const duplicate = ctx.existingKeys.has(key) || ctx.newKeys.has(key);
  ctx.newKeys.add(key);
  return { rowNumber, raw, data, amount: amount.amount, errors: [], duplicate: duplicate || undefined };
};

/**
 * Lit la première feuille. Montant et date en valeur brute (nombre Excel, sans formatage
 * régional), les autres colonnes en texte affiché. Lève une Error (message FR) si le fichier
 * dépasse les limites.
 */
export const parseFile = async (file: File): Promise<Record<string, unknown>[]> => {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error('Fichier trop volumineux (5 Mo maximum).');
  }
  const workbook = await readWorkbook(file);
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: true });
  if (rawRows.length > MAX_IMPORT_ROWS) {
    throw new Error(`Trop de lignes (${rawRows.length}) : ${MAX_IMPORT_ROWS} maximum par import.`);
  }
  const textRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false });
  return rawRows.map((rawRow, i) =>
    Object.fromEntries(
      Object.entries(rawRow).map(([key, value]) => {
        const field = fieldOfHeader(key);
        const useRaw = field !== undefined && RAW_FIELDS.includes(field);
        return [key, useRaw ? value : textRows[i]?.[key] ?? value];
      })
    )
  );
};

/** Analyse des en-têtes : colonnes attendues absentes et en-têtes non reconnus. */
export const analyzeHeaders = (
  headers: string[]
): { present: Set<Field>; missingColumns: ExpectedColumn[]; unrecognizedHeaders: string[] } => {
  const present = new Set(headers.map(fieldOfHeader).filter((f): f is Field => f !== undefined));
  const expected: ExpectedColumn[] = ['amount', 'paymentType', 'registrationDate'];
  const unrecognizedHeaders = headers.filter(
    (h) =>
      fieldOfHeader(h) === undefined &&
      !IGNORED_HEADERS.includes(normalizeHeader(h)) &&
      !h.startsWith('__EMPTY')
  );
  return { present, missingColumns: expected.filter((c) => !present.has(c)), unrecognizedHeaders };
};

export const validateRows = (
  rows: Record<string, unknown>[],
  activity: Activity,
  existingRegistrations: Registration[]
): ParseResult => {
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const { present, missingColumns, unrecognizedHeaders } = analyzeHeaders(headers);
  const existingKeys = new Set(
    existingRegistrations
      .filter((r) => r.activityId === activity.id)
      .map((r) => personKey(r.lastName, r.firstName, r.phone))
  );
  const ctx: ValidateContext = { activity, present, existingKeys, newKeys: new Set() };
  const parsed = rows.map((raw, i) => validateRow(raw, i + HEADER_ROW_OFFSET, ctx));
  const invalid = parsed.filter((r) => r.errors.length > 0);
  const duplicates = parsed.filter((r) => r.errors.length === 0 && r.duplicate);
  const valid = parsed.filter((r) => r.errors.length === 0 && !r.duplicate);
  return {
    total: rows.length,
    valid,
    invalid,
    duplicates,
    missingColumns,
    unrecognizedHeaders,
    totalAmount: valid.reduce((sum, r) => sum + r.amount, 0),
  };
};

export const downloadTemplate = (): void => {
  const data = [
    {
      Nom: 'DIOP',
      'Prénoms': 'Aminata',
      'Téléphone': '77 000 00 01',
      Adresse: 'Dakar, Plateau',
      Montant: 5000,
      'Type de paiement': 'wave',
      "Date d'inscription": '15/05/2026',
    },
    {
      Nom: 'SOW',
      'Prénoms': 'Mamadou',
      'Téléphone': '77 000 00 02',
      Adresse: 'Thiès',
      Montant: 3000,
      'Type de paiement': 'espèce',
      "Date d'inscription": '2026-05-16',
    },
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(data);
  worksheet['!cols'] = [
    { wch: 14 }, { wch: 16 }, { wch: 14 }, { wch: 24 }, { wch: 10 }, { wch: 18 }, { wch: 18 },
  ];
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Inscriptions');
  XLSX.writeFile(workbook, 'modele_import_inscriptions.xlsx');
};
