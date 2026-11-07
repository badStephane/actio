import { getDb } from './db';

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

export const searchContacts = async (query: string, limit = 8): Promise<Contact[]> => {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

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
    if (digits.length >= 3) {
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

export const getAllContactDedupKeys = async (): Promise<Set<string>> => {
  const db = await getDb();
  const rows = await db.select<{ last_name: string; first_name: string; phone: string }[]>(
    'SELECT last_name, first_name, phone FROM contacts'
  );
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s_'`-]+/g, '').trim();
  return new Set(
    rows.map(r => `${norm(r.last_name)}|${norm(r.first_name)}|${r.phone.replace(/\D/g, '')}`)
  );
};

export const countContacts = async (): Promise<number> => {
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>('SELECT COUNT(*) as n FROM contacts');
  return rows[0]?.n ?? 0;
};

export const listSources = async (): Promise<{ source: string; count: number }[]> => {
  const db = await getDb();
  const rows = await db.select<{ source: string | null; n: number }[]>(
    `SELECT source, COUNT(*) as n FROM contacts GROUP BY source ORDER BY MAX(created_at) DESC`
  );
  return rows.map(r => ({ source: r.source ?? '(sans source)', count: r.n }));
};

const CONTACT_BATCH_SIZE = 200;

export const addContactsBulk = async (
  contacts: ImportableContact[]
): Promise<number> => {
  if (contacts.length === 0) return 0;
  const db = await getDb();
  const now = Date.now();
  let inserted = 0;

  for (let start = 0; start < contacts.length; start += CONTACT_BATCH_SIZE) {
    const batch = contacts.slice(start, start + CONTACT_BATCH_SIZE);
    const placeholders: string[] = [];
    const params: unknown[] = [];
    let p = 1;
    for (const c of batch) {
      placeholders.push(
        `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`
      );
      params.push(
        crypto.randomUUID(),
        c.lastName,
        c.firstName,
        c.phone,
        c.address,
        c.source ?? null,
        now
      );
    }
    try {
      await db.execute(
        `INSERT INTO contacts (${COLUMNS}) VALUES ${placeholders.join(', ')}`,
        params
      );
      inserted += batch.length;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Lot ${start + 1}-${start + batch.length} — ${msg}`
      );
    }
  }

  return inserted;
};

export const clearContacts = async (source?: string): Promise<number> => {
  const db = await getDb();
  if (source && source !== '(sans source)') {
    const result = await db.execute('DELETE FROM contacts WHERE source = $1', [source]);
    return result.rowsAffected;
  }
  if (source === '(sans source)') {
    const result = await db.execute('DELETE FROM contacts WHERE source IS NULL');
    return result.rowsAffected;
  }
  const result = await db.execute('DELETE FROM contacts');
  return result.rowsAffected;
};
