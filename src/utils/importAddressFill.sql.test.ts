/**
 * Validation QA du chantier UX (P7, 07-qa-ux.md) : reprise de l'adresse depuis le carnet à l'import (D19)
 * sur le VRAI schéma (migrations 1 à 12 lues dans src-tauri, node:sqlite), avec la vraie recherche
 * `searchContacts`. Vérifie : pas d'écrasement, atomicité de l'import inchangée, nombre de requêtes.
 * Prérequis : Node >= 22.13 (comme dataLayer.sql.test.ts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import libRs from '../../src-tauri/src/lib.rs?raw';
import schemaRs from '../../src-tauri/src/schema.rs?raw';
import type { Activity } from '../types';

interface SqliteStatement {
  all(...params: unknown[]): Record<string, unknown>[];
  run(...params: unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
}
interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}
const SQLITE_MODULE = 'node:sqlite';
const { DatabaseSync } = (await import(/* @vite-ignore */ SQLITE_MODULE)) as { DatabaseSync: new (p: string) => SqliteDb };

const state = vi.hoisted(() => ({ db: null as unknown, selects: 0, executes: 0 }));
vi.mock('./db', () => ({ getDb: () => Promise.resolve(state.db) }));

import { addRegistrationsBulk } from './storage';
import { fillAddressesFromContacts, validateRows } from './importRegistrations';

const unescapeRust = (s: string): string =>
  s.replace(/\\(["\\nrt'0])/g, (_m, c: string) => ({ n: '\n', r: '\r', t: '\t', '0': '\0' })[c] ?? c);
const SCHEMA_CONSTS = new Map(
  [...schemaRs.matchAll(/pub const (\w+): &str = "((?:[^"\\]|\\.)*)";/g)].map((m) => [m[1], unescapeRust(m[2])])
);
const MIGRATIONS = [
  ...libRs.matchAll(/version:\s*(\d+),\s*description:\s*"[^"]*",\s*sql:\s*(?:"((?:[^"\\]|\\.)*)"|schema::(\w+)),/g),
].map((m) => ({ version: Number(m[1]), sql: m[2] !== undefined ? unescapeRust(m[2]) : SCHEMA_CONSTS.get(m[3]) ?? '' }));

let raw: SqliteDb;
const toPositional = (sql: string): string => sql.replace(/\$(\d+)/g, '?$1');

beforeEach(() => {
  raw = new DatabaseSync(':memory:');
  raw.exec('PRAGMA foreign_keys = ON');
  for (const m of MIGRATIONS) raw.exec(m.sql);
  state.selects = 0;
  state.executes = 0;
  state.db = {
    select: async (sql: string, params: unknown[] = []) => {
      state.selects++;
      return raw.prepare(toPositional(sql)).all(...params);
    },
    execute: async (sql: string, params: unknown[] = []) => {
      state.executes++;
      const r = raw.prepare(toPositional(sql)).run(...params);
      return { rowsAffected: Number(r.changes), lastInsertId: Number(r.lastInsertRowid) };
    },
  };
});
afterEach(() => raw.close());

const ACTIVITY: Activity = { id: '00000000-0000-0000-0000-000000000001', name: 'Général', color: '#000', defaultAmount: 2500, createdAt: 1 };

const insertContacts = (contacts: { last: string; first: string; phone: string; address: string }[]) => {
  const stmt = raw.prepare('INSERT INTO contacts (id, last_name, first_name, phone, address, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  contacts.forEach((c, i) => stmt.run(`c${i}`, c.last, c.first, c.phone, c.address, 'qa', i));
};

const phoneOf = (i: number): string => `77 ${String(1_000_000 + i).slice(0, 3)} ${String(1_000_000 + i).slice(3, 5)} ${String(1_000_000 + i).slice(5, 7)}`;
const fileRow = (i: number, address = '') => ({
  Nom: `Nom${i}`, 'Prénoms': `Prenom${i}`, 'Téléphone': phoneOf(i), Adresse: address, Montant: 2500,
  'Mode de paiement': 'Espèces', "Date d'inscription": '2026-11-07',
});

describe('reprise d’adresse depuis le carnet, vraie base (D19)', () => {
  it('ne remplace jamais une adresse du fichier ; reprend seulement la même personne et le même numéro', async () => {
    insertContacts([
      { last: 'DIOP', first: 'Awa', phone: '+221 77 123 45 67', address: 'Médina' },
      { last: 'Fall', first: 'Modou', phone: '78 000 00 01', address: 'Thiès' },
    ]);
    const parsed = validateRows(
      [
        { ...fileRow(0), Nom: 'Diop', 'Prénoms': 'Awa', 'Téléphone': '77 123 45 67' }, // carnet : repris
        { ...fileRow(1, 'Plateau'), Nom: 'Fall', 'Prénoms': 'Modou', 'Téléphone': '78 000 00 01' }, // fichier gardé
        { ...fileRow(2), Nom: 'Fall', 'Prénoms': 'Moussa', 'Téléphone': '78 000 00 01' }, // autre prénom : rien
      ],
      ACTIVITY,
      []
    );
    const result = await fillAddressesFromContacts(parsed);
    expect(result.valid.map((r) => [r.data?.address, r.addressFromContacts ?? false])).toEqual([
      ['Médina', true],
      ['Plateau', false],
      ['', false],
    ]);
  });

  it('import après reprise : toujours UNE instruction d’écriture (json_each), tout ou rien', async () => {
    insertContacts([{ last: 'Diop', first: 'Awa', phone: '77 123 45 67', address: 'Médina' }]);
    const parsed = validateRows([{ ...fileRow(0), Nom: 'Diop', 'Prénoms': 'Awa', 'Téléphone': '77 123 45 67' }, fileRow(1)], ACTIVITY, []);
    const filled = await fillAddressesFromContacts(parsed);
    state.executes = 0;
    const rows = filled.valid.map((r) => r.data!);
    await expect(addRegistrationsBulk([...rows, { ...rows[1], activityId: 'activite-inconnue' }])).rejects.toThrow();
    expect(raw.prepare('SELECT COUNT(*) AS n FROM registrations').all()).toEqual([{ n: 0 }]);
    await addRegistrationsBulk(rows);
    expect(raw.prepare('SELECT address FROM registrations ORDER BY last_name').all()).toEqual([{ address: 'Médina' }, { address: '' }]);
  });

  // Mesure faite à N = 5 000 (07-qa-ux.md, QA-UX-03) : 5 000 requêtes, 11,7 s sans IPC. Corrigé (D23) : une seule lecture
  // du carnet indexée par personKey. Ici N = 500 pour garder la suite rapide (CI lente : marge sous testTimeout).
  it('lignes sans adresse : UNE seule requête quel que soit N (QA-UX-03 corrigé), carnet de 5 000 contacts, durée mesurée', async () => {
    const N = 500;
    const BOOK = 5000;
    insertContacts(Array.from({ length: BOOK }, (_, i) => ({ last: `Nom${i}`, first: `Prenom${i}`, phone: phoneOf(i), address: i % 2 ? `Quartier ${i}` : '' })));
    const parsed = validateRows(Array.from({ length: N }, (_, i) => fileRow(i)), ACTIVITY, []);
    expect(parsed.valid).toHaveLength(N);
    state.selects = 0;
    const started = performance.now();
    const result = await fillAddressesFromContacts(parsed);
    const elapsedMs = performance.now() - started;
    expect(state.selects).toBe(1); // QA-UX-03 corrigé : 1 aller-retour vers la base au lieu de N
    expect(result.valid.filter((r) => r.addressFromContacts)).toHaveLength(N / 2);
    console.info(`[QA-UX-03] reprise d'adresse : ${N} lignes, ${state.selects} requête sur un carnet de ${BOOK}, ${Math.round(elapsedMs)} ms sans IPC (node:sqlite)`);
  });
});
