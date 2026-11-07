/**
 * Intégration de la couche données sur le VRAI schéma : les migrations 1 à 12 sont lues dans
 * src-tauri (lib.rs, schema.rs) et appliquées à une base SQLite en mémoire (node:sqlite),
 * avec foreign_keys = ON comme sqlx. getDb() est remplacé par un adaptateur qui imite
 * l'API de @tauri-apps/plugin-sql (select / execute, paramètres $1..$n).
 * Prérequis : Node >= 22.13 (node:sqlite sans option).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import libRs from '../../src-tauri/src/lib.rs?raw';
import schemaRs from '../../src-tauri/src/schema.rs?raw';

interface SqliteStatement {
  all(...params: unknown[]): Record<string, unknown>[];
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}
interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}
interface SqliteModule {
  DatabaseSync: new (path: string) => SqliteDb;
}

const SQLITE_MODULE = 'node:sqlite';
const { DatabaseSync } = (await import(/* @vite-ignore */ SQLITE_MODULE)) as SqliteModule;

const state = vi.hoisted(() => ({
  db: null as unknown,
  failOpen: false,
}));

vi.mock('./db', () => ({
  getDb: () => (state.failOpen ? Promise.reject(new Error('database is locked')) : Promise.resolve(state.db)),
}));

import {
  addRegistration,
  addRegistrationsBulk,
  deleteRegistration,
  findDuplicateRegistration,
  getRegistrationById,
  getRegistrations,
  updateRegistration,
} from './storage';
import { ACTIVITY_IN_USE_MESSAGE, countRegistrationsByActivity, deleteActivity } from './activities';
import { clearAuditLog, getAuditEvents } from './audit';
import {
  createInitialPassword,
  generateRecoveryCode,
  hasPassword,
  hasRecoveryCode,
  lockDurationMs,
  RECOVERY_ALPHABET,
  updatePassword,
  verifyPassword,
  verifyRecoveryCode,
} from './auth';
import { findSuspiciousRegistrations, markReviewed } from './importReview';

// ---------- Migrations lues dans le code Rust ----------

const unescapeRust = (s: string): string =>
  s.replace(/\\(["\\nrt'0])/g, (_m, c: string) => ({ n: '\n', r: '\r', t: '\t', '0': '\0' })[c] ?? c);

const SCHEMA_CONSTS = new Map(
  [...schemaRs.matchAll(/pub const (\w+): &str = "((?:[^"\\]|\\.)*)";/g)].map((m) => [m[1], unescapeRust(m[2])])
);

const MIGRATIONS = [
  ...libRs.matchAll(/version:\s*(\d+),\s*description:\s*"[^"]*",\s*sql:\s*(?:"((?:[^"\\]|\\.)*)"|schema::(\w+)),/g),
].map((m) => {
  const sql = m[2] !== undefined ? unescapeRust(m[2]) : SCHEMA_CONSTS.get(m[3]);
  if (!sql) throw new Error(`SQL introuvable pour la migration ${m[1]}`);
  return { version: Number(m[1]), sql };
});

const MIGRATION_11_AT = '2026-11-07 10:00:00'; // UTC, comme CURRENT_TIMESTAMP de sqlx
const MIGRATION_11_MS = Date.UTC(2026, 10, 7, 10, 0, 0);

let raw: SqliteDb;

const applyMigrations = (from: number, to: number): void => {
  raw.exec(`CREATE TABLE IF NOT EXISTS _sqlx_migrations (version BIGINT PRIMARY KEY, description TEXT NOT NULL,
    installed_on TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, success BOOLEAN NOT NULL, checksum BLOB NOT NULL,
    execution_time BIGINT NOT NULL)`);
  for (const m of MIGRATIONS.filter((x) => x.version >= from && x.version <= to)) {
    raw.exec('BEGIN');
    raw.exec(m.sql);
    raw
      .prepare("INSERT INTO _sqlx_migrations (version, description, installed_on, success, checksum, execution_time) VALUES (?1, 'm', ?2, 1, x'00', 0)")
      .run(m.version, m.version === 11 ? MIGRATION_11_AT : '2026-01-01 00:00:00');
    raw.exec('COMMIT');
  }
};

const toPositional = (sql: string): string => sql.replace(/\$(\d+)/g, '?$1');

const adapter = {
  select: async <T>(sql: string, params: unknown[] = []): Promise<T> =>
    raw.prepare(toPositional(sql)).all(...params) as T,
  execute: async (sql: string, params: unknown[] = []) => {
    const r = raw.prepare(toPositional(sql)).run(...params);
    return { rowsAffected: Number(r.changes), lastInsertId: Number(r.lastInsertRowid) };
  },
};

const rows = <T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] =>
  raw.prepare(sql).all(...params) as T[];

const openDb = (upTo = 12): void => {
  raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  applyMigrations(1, upTo);
  state.db = adapter;
  state.failOpen = false;
};

const DEFAULT_ACT = '00000000-0000-0000-0000-000000000001';

const newReg = (overrides: Record<string, unknown> = {}) => ({
  firstName: 'Awa',
  lastName: 'Diop',
  phone: '77 123 45 67',
  address: 'Médina',
  registrationDate: '2026-05-15',
  paymentType: 'wave' as const,
  amount: 5000,
  activityId: DEFAULT_ACT,
  ...overrides,
});

beforeEach(() => openDb());
afterEach(() => raw.close());

describe('schéma réel', () => {
  it('lit les 12 migrations, versions continues', () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('migration 11 : un montant texte non numérique devient 0, la valeur reste dans l’historique', () => {
    raw.close();
    openDb(9);
    raw.exec(`INSERT INTO registrations (id, first_name, last_name, phone, address, registration_date, payment_type, amount, activity_id, created_at)
      VALUES ('t1', 'A', 'B', '', 'x', '2026-01-01', 'cash', 'abc', '${DEFAULT_ACT}', 1)`);
    applyMigrations(10, 12);
    expect(rows('SELECT amount, typeof(amount) AS t FROM registrations')).toEqual([{ amount: 0, t: 'integer' }]);
    const [trace] = rows<{ old: string }>("SELECT json_extract(details, '$.oldValue') AS old FROM audit_events WHERE entity_id = 't1'");
    expect(trace.old).toBe('abc');
    expect(rows('SELECT * FROM amount_review')).toEqual([]); // preuve dans audit_events seulement
  });
});

describe('storage (D1, QA-04, QA-17)', () => {
  it('refuse décimal et date impossible avant toute écriture', async () => {
    await expect(addRegistration(newReg({ amount: 1500.5 }))).rejects.toThrow(/Montant invalide/);
    await expect(addRegistration(newReg({ registrationDate: '2026-02-30' }))).rejects.toThrow(/Date/);
    expect(rows('SELECT id FROM registrations')).toEqual([]);
  });

  it('enregistre un montant entier et journalise la création', async () => {
    const r = await addRegistration(newReg({ amount: 0 }));
    expect(rows('SELECT amount, typeof(amount) AS t FROM registrations')).toEqual([{ amount: 0, t: 'integer' }]);
    expect(rows("SELECT entity_id FROM audit_events WHERE event_type = 'created'")).toEqual([{ entity_id: r.id }]);
    await updateRegistration({ ...r, amount: 7500 });
    expect((await getRegistrations())[0].amount).toBe(7500);
  });

  it('import en masse ATOMIQUE : une ligne invalide en base = aucune ligne insérée (json_each)', async () => {
    const batch = [newReg(), newReg({ lastName: 'Sow' }), newReg({ lastName: 'Ba', activityId: 'activite-inconnue' })];
    await expect(addRegistrationsBulk(batch)).rejects.toThrow(/FOREIGN KEY/);
    expect(rows('SELECT COUNT(*) AS n FROM registrations')).toEqual([{ n: 0 }]);
    expect(rows("SELECT COUNT(*) AS n FROM audit_events WHERE event_type = 'imported'")).toEqual([{ n: 0 }]);
  });

  it('import en masse : un événement `imported` avec nombre et total', async () => {
    const inserted = await addRegistrationsBulk([newReg(), newReg({ lastName: 'Sow', amount: 3000 }), newReg({ lastName: 'Ba', amount: 0 })]);
    expect(inserted).toHaveLength(3);
    expect(new Set(inserted.map((r) => r.createdAt)).size).toBe(1);
    const [event] = rows<{ entity_type: string; details: string }>("SELECT entity_type, details FROM audit_events WHERE event_type = 'imported'");
    expect(event.entity_type).toBe('system');
    expect(JSON.parse(event.details)).toMatchObject({ count: 3, totalAmount: 8000 });
    expect(await addRegistrationsBulk([])).toEqual([]);
  });

  it('import réussi mais historique en échec : message explicite « ne relancez pas » (pas de doublons)', async () => {
    raw.exec("CREATE TRIGGER no_import_log BEFORE INSERT ON audit_events WHEN NEW.event_type = 'imported' BEGIN SELECT RAISE(ABORT, 'disque plein'); END");
    await expect(addRegistrationsBulk([newReg(), newReg({ lastName: 'Sow' })])).rejects.toThrow(/2 inscriptions ont bien été importées.*Ne relancez pas/);
    expect(rows('SELECT COUNT(*) AS n FROM registrations')).toEqual([{ n: 2 }]);
  });

  it('suppression journalisée ; lecture par identifiant', async () => {
    const r = await addRegistration(newReg());
    expect((await getRegistrationById(r.id))?.lastName).toBe('Diop');
    await deleteRegistration(r.id);
    expect(await getRegistrationById(r.id)).toBeNull();
    expect(rows("SELECT entity_id FROM audit_events WHERE event_type = 'deleted'")).toEqual([{ entity_id: r.id }]);
  });

  it('import en masse : montant invalide refusé avant la base', async () => {
    await expect(addRegistrationsBulk([newReg(), newReg({ amount: -1 })])).rejects.toThrow(/Montant invalide/);
    expect(rows('SELECT COUNT(*) AS n FROM registrations')).toEqual([{ n: 0 }]);
  });

  it('doublon détecté malgré le format du téléphone et les accents (D9)', async () => {
    const r = await addRegistration(newReg({ lastName: 'Bâ', phone: '+221 77 123 45 67' }));
    expect((await findDuplicateRegistration(DEFAULT_ACT, 'BA', 'awa', '771234567'))?.id).toBe(r.id);
    expect(await findDuplicateRegistration(DEFAULT_ACT, 'BA', 'awa', '771234567', r.id)).toBeNull();
  });
});

describe('activités et historique (M9, M10, D8)', () => {
  it('refuse de supprimer une activité qui a des inscriptions (clé étrangère)', async () => {
    raw.exec("INSERT INTO activities (id, name, created_at) VALUES ('gala', 'Gala', 1), ('vide', 'Vide', 1)");
    await addRegistration(newReg({ activityId: 'gala' }));
    await expect(deleteActivity('gala')).rejects.toThrow(ACTIVITY_IN_USE_MESSAGE);
    await deleteActivity('vide');
    expect(await countRegistrationsByActivity()).toEqual({ gala: 1 });
  });

  it('l’historique refuse UPDATE ; l’effacer laisse un événement audit_cleared', async () => {
    await addRegistration(newReg());
    expect(() => raw.exec("UPDATE audit_events SET summary = 'x'")).toThrow(/AUDIT_IMMUTABLE/);
    await clearAuditLog();
    const events = await getAuditEvents();
    expect(events.map((e) => [e.eventType, e.entityType])).toEqual([['audit_cleared', 'system']]);
  });
});

describe('auth (M2, M3, M4, D2, QA-08, QA-11, QA-20)', () => {
  it('lockDurationMs : 5 essais libres puis 30 s doublés, plafond 15 min', () => {
    expect([0, 4, 5, 6, 9, 10, 100].map(lockDurationMs)).toEqual([0, 0, 30_000, 60_000, 480_000, 900_000, 900_000]);
  });

  it('échec fermé : base illisible = erreur, jamais « pas de mot de passe »', async () => {
    state.failOpen = true;
    await expect(hasPassword()).rejects.toThrow(/locked/);
  });

  it('mot de passe initial : 8 caractères minimum, jamais écrasé par une seconde création', async () => {
    expect(await hasPassword()).toBe(false);
    await expect(createInitialPassword('court')).rejects.toThrow(/8 caractères/);
    await createInitialPassword('motdepasse1');
    await expect(createInitialPassword('autrepasse2')).rejects.toThrow('Un mot de passe existe déjà.');
    expect(await verifyPassword('motdepasse1')).toEqual({ ok: true });
  });

  it('compteur d’échecs persistant et blocage, même avec le bon mot de passe', async () => {
    await createInitialPassword('motdepasse1');
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    expect(await verifyPassword('faux')).toEqual({ ok: false, retryAfterMs: 0, attemptsLeft: 4 });
    for (let i = 0; i < 3; i++) await verifyPassword('faux');
    expect(await verifyPassword('faux')).toEqual({ ok: false, retryAfterMs: 30_000, attemptsLeft: 0 });
    expect(await verifyPassword('motdepasse1')).toMatchObject({ ok: false, retryAfterMs: 30_000 });
    vi.spyOn(Date, 'now').mockReturnValue(now + 30_001);
    expect(await verifyPassword('motdepasse1')).toEqual({ ok: true });
    expect(rows('SELECT failed_attempts, locked_until FROM auth_settings')).toEqual([{ failed_attempts: 0, locked_until: null }]);
  });

  it('changer le mot de passe conserve le code de récupération (QA-08)', async () => {
    await createInitialPassword('motdepasse1');
    const code = await generateRecoveryCode();
    await updatePassword('nouveaupasse2');
    expect(await hasRecoveryCode()).toBe(true);
    expect(await verifyRecoveryCode(code)).toEqual({ ok: true });
    expect(await verifyPassword('nouveaupasse2')).toEqual({ ok: true });
  });

  it('code de récupération : 80 bits, format lisible, normalisé, à USAGE UNIQUE (D2)', async () => {
    await expect(generateRecoveryCode()).rejects.toThrow(/mot de passe/);
    await createInitialPassword('motdepasse1');
    const code = await generateRecoveryCode();
    const group = `[${RECOVERY_ALPHABET}]{4}`;
    expect(code).toMatch(new RegExp(`^${group}-${group}-${group}-${group}$`));
    expect(await verifyRecoveryCode(` ${code.toLowerCase().replace(/-/g, ' ')} `)).toEqual({ ok: true });
    expect(await hasRecoveryCode()).toBe(false);
    expect(await verifyRecoveryCode(code)).toEqual({ ok: false, retryAfterMs: 0 });
    expect(rows("SELECT COUNT(*) AS n FROM audit_events WHERE event_type = 'recovery_used'")).toEqual([{ n: 1 }]);
  });

  it('code choisi avant 2.1.0 (enregistré après trim) accepté avec espaces autour (QA-20)', async () => {
    await createInitialPassword('motdepasse1');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode('ab12'), 'PBKDF2', false, ['deriveBits']);
    const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, key, 256));
    const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
    raw.prepare('UPDATE auth_settings SET recovery_hash = ?1, recovery_salt = ?2, recovery_iterations = 100000').run(b64(bits), b64(salt));
    expect(await verifyRecoveryCode('  ab12 ')).toEqual({ ok: true });
  });

  it('les mauvais codes partagent le compteur du mot de passe', async () => {
    await createInitialPassword('motdepasse1');
    await generateRecoveryCode();
    for (let i = 0; i < 4; i++) await verifyRecoveryCode('AAAA-AAAA-AAAA-AAAA');
    expect(await verifyRecoveryCode('AAAA-AAAA-AAAA-AAAA')).toMatchObject({ ok: false, retryAfterMs: 30_000 });
    expect((await verifyPassword('motdepasse1')).ok).toBe(false);
  });
});

describe('contrôle des imports (Avenant A1, D15)', () => {
  const seedOldBatch = (amount: number, createdAt = MIGRATION_11_MS - 86_400_000): void => {
    raw.exec("INSERT INTO activities (id, name, default_amount, created_at) VALUES ('gala', 'Gala', 5000, 1)");
    for (const id of ['a', 'b', 'c']) {
      raw.prepare(`INSERT INTO registrations (id, first_name, last_name, phone, address, registration_date, payment_type, amount, activity_id, created_at)
        VALUES (?1, 'A', ?1, '771234567', 'x', '2026-05-20', 'cash', ?2, 'gala', ?3)`).run(id, amount, createdAt);
    }
  };

  it('signale un ancien lot à 5 F puis « C’est correct » le retire et le journalise', async () => {
    seedOldBatch(5);
    const found = await findSuspiciousRegistrations();
    expect(found.map((s) => [s.registration.id, s.suggestedAmount])).toEqual([['a', 5000], ['b', 5000], ['c', 5000]]);
    await markReviewed('a');
    expect((await findSuspiciousRegistrations()).map((s) => s.registration.id)).toEqual(['b', 'c']);
    expect(rows("SELECT summary FROM audit_events WHERE entity_id = 'a'")).toHaveLength(1);
    await expect(markReviewed('inconnu')).rejects.toThrow('Inscription introuvable.');
  });

  it('ignore un lot créé après la migration 11', async () => {
    seedOldBatch(5, MIGRATION_11_MS + 60_000);
    expect(await findSuspiciousRegistrations()).toEqual([]);
  });
});
