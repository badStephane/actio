import { getDb } from './db';
import { DEMO_MODE, demoContacts } from './demo';
import { nameKey, personKey } from './phone';

export interface Contact {
  id: string;
  lastName: string;
  firstName: string;
  phone: string;
  address: string;
  source?: string;
  createdAt: number;
}

export type ImportableContact = Omit<Contact, 'id' | 'createdAt'>;

interface Row {
  id: string;
  last_name: string;
  first_name: string;
  phone: string;
  address: string;
  source: string | null;
  created_at: number;
}

const COLUMNS = 'id, last_name, first_name, phone, address, source, created_at';

const rowToContact = (r: Row): Contact => ({
  id: r.id,
  lastName: r.last_name,
  firstName: r.first_name,
  phone: r.phone,
  address: r.address,
  source: r.source ?? undefined,
  createdAt: r.created_at,
});

const escapeLike = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');

const normalizePhone = (s: string): string => s.replace(/\D/g, '');

const MIN_PHONE_TOKEN_DIGITS = 3;

const matchesToken = (c: Contact, token: string): boolean => {
  const digits = normalizePhone(token);
  return (
    nameKey(c.lastName).startsWith(nameKey(token)) ||
    nameKey(c.firstName).startsWith(nameKey(token)) ||
    (digits.length >= MIN_PHONE_TOKEN_DIGITS && normalizePhone(c.phone).includes(digits))
  );
};

const byName = (a: Contact, b: Contact): number =>
  a.lastName.localeCompare(b.lastName, 'fr') || a.firstName.localeCompare(b.firstName, 'fr');

export const searchContacts = async (query: string, limit = 8): Promise<Contact[]> => {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];
  if (DEMO_MODE) {
    const tokens = trimmed.split(/\s+/).filter(Boolean);
    return demoContacts
      .filter((c) => tokens.every((t) => matchesToken(c, t)))
      .sort(byName)
      .slice(0, Math.max(1, Math.min(50, limit)));
  }

  const db = await getDb();
  const tokens = trimmed
    .split(/\s+/)
    .map(t => t.toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return [];

  const conditions: string[] = [];
  const params: unknown[] = [];

  // Each token must match either name or phone — tokens AND'd together.
  for (const t of tokens) {
    const escaped = escapeLike(t);
    const digits = normalizePhone(t);
    const orParts: string[] = [
      `LOWER(last_name) LIKE ? ESCAPE '\\'`,
      `LOWER(first_name) LIKE ? ESCAPE '\\'`,
    ];
    params.push(`${escaped}%`, `${escaped}%`);
    if (digits.length >= MIN_PHONE_TOKEN_DIGITS) {
      orParts.push(
        `REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE ?`
      );
      params.push(`%${digits}%`);
    }
    conditions.push(`(${orParts.join(' OR ')})`);
  }

  const sql = `
    SELECT ${COLUMNS} FROM contacts
    WHERE ${conditions.join(' AND ')}
    ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE
    LIMIT ${Math.max(1, Math.min(50, limit))}
  `;

  const rows = await db.select<Row[]>(sql, params);
  return rows.map(rowToContact);
};

/** Clés de doublon (nom, prénom, 9 derniers chiffres du téléphone : D9) des contacts existants. */
export const getAllContactDedupKeys = async (): Promise<Set<string>> => {
  if (DEMO_MODE) return new Set(demoContacts.map((c) => personKey(c.lastName, c.firstName, c.phone)));
  const db = await getDb();
  const rows = await db.select<{ last_name: string; first_name: string; phone: string }[]>(
    'SELECT last_name, first_name, phone FROM contacts'
  );
  return new Set(rows.map((r) => personKey(r.last_name, r.first_name, r.phone)));
};

export const countContacts = async (): Promise<number> => {
  if (DEMO_MODE) return demoContacts.length;
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>('SELECT COUNT(*) as n FROM contacts');
  return rows[0]?.n ?? 0;
};

const NO_SOURCE_LABEL = '(sans source)';

export const listSources = async (): Promise<{ source: string; count: number }[]> => {
  if (DEMO_MODE) {
    const counts = demoContacts.reduce<Record<string, number>>(
      (acc, c) => ({ ...acc, [c.source ?? NO_SOURCE_LABEL]: (acc[c.source ?? NO_SOURCE_LABEL] ?? 0) + 1 }),
      {}
    );
    return Object.entries(counts).map(([source, count]) => ({ source, count }));
  }
  const db = await getDb();
  const rows = await db.select<{ source: string | null; n: number }[]>(
    `SELECT source, COUNT(*) as n FROM contacts GROUP BY source ORDER BY MAX(created_at) DESC`
  );
  return rows.map(r => ({ source: r.source ?? NO_SOURCE_LABEL, count: r.n }));
};

/** Import atomique (une seule instruction INSERT ... SELECT FROM json_each, voir storage.ts). */
const BULK_INSERT_SQL = `INSERT INTO contacts (${COLUMNS})
  SELECT json_extract(value, '$.id'), json_extract(value, '$.lastName'), json_extract(value, '$.firstName'),
         json_extract(value, '$.phone'), json_extract(value, '$.address'), json_extract(value, '$.source'),
         json_extract(value, '$.createdAt')
  FROM json_each($1)`;

export const addContactsBulk = async (
  contacts: ImportableContact[]
): Promise<number> => {
  if (contacts.length === 0) return 0;
  const now = Date.now();
  const rows: Contact[] = contacts.map((c) => ({ ...c, id: crypto.randomUUID(), createdAt: now }));
  if (DEMO_MODE) {
    demoContacts.push(...rows);
    return rows.length;
  }
  const db = await getDb();
  await db.execute(BULK_INSERT_SQL, [JSON.stringify(rows.map((r) => ({ ...r, source: r.source ?? null })))]);
  return rows.length;
};

const matchesSource = (c: Contact, source?: string): boolean =>
  source === undefined || (source === NO_SOURCE_LABEL ? c.source === undefined : c.source === source);

export const clearContacts = async (source?: string): Promise<number> => {
  if (DEMO_MODE) {
    const kept = demoContacts.filter((c) => !matchesSource(c, source));
    const removed = demoContacts.length - kept.length;
    demoContacts.splice(0, demoContacts.length, ...kept);
    return removed;
  }
  const db = await getDb();
  if (source && source !== NO_SOURCE_LABEL) {
    const result = await db.execute('DELETE FROM contacts WHERE source = $1', [source]);
    return result.rowsAffected;
  }
  if (source === NO_SOURCE_LABEL) {
    const result = await db.execute('DELETE FROM contacts WHERE source IS NULL');
    return result.rowsAffected;
  }
  const result = await db.execute('DELETE FROM contacts');
  return result.rowsAffected;
};
