import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import type { Activity, Registration } from '../types';

// L'export appelle XLSX.writeFile (téléchargement) : on capture le classeur au lieu d'écrire.
const captured = vi.hoisted(() => ({ workbooks: [] as unknown[] }));
vi.mock('xlsx', async (importOriginal) => {
  const actual = await importOriginal<typeof import('xlsx')>();
  return {
    ...actual,
    writeFile: (wb: unknown) => {
      captured.workbooks.push(wb);
    },
  };
});

import {
  analyzeHeaders,
  downloadTemplate,
  MAX_IMPORT_FILE_BYTES,
  normalizeHeader,
  parseFile,
  parsePaymentType,
  toIsoDate,
  validateRows,
} from './importRegistrations';
import { exportToExcel } from './excelExport';

const ACTIVITY: Activity = { id: 'act-1', name: 'Gala', color: '#000', createdAt: 1, defaultAmount: 5000 };
const FREE_ACTIVITY: Activity = { id: 'act-2', name: 'Atelier', color: '#000', createdAt: 1 };

/** Numéro de série Excel (système 1900) d'une date civile. */
const serial = (y: number, m: number, d: number): number =>
  (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86_400_000;

const workbookFile = (wb: XLSX.WorkBook, name = 'import.xlsx'): File => {
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([bytes], name);
};

const sheetFile = (rows: XLSX.CellObject[][] | (string | number)[][]): File => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'Feuille1');
  return workbookFile(wb);
};

/** CSV UTF-8 avec BOM, comme l'enregistre Excel (« CSV UTF-8 »). */
const csvFile = (text: string, withBom = true): File =>
  new File([new Uint8Array([...(withBom ? [0xef, 0xbb, 0xbf] : []), ...new TextEncoder().encode(text)])], 'import.csv');

const CSV_HEADER = 'Nom;Prénoms;Téléphone;Adresse;Montant;Type de paiement;Date';

const row = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  Nom: 'Diop',
  'Prénoms': 'Awa',
  'Téléphone': '77 123 45 67',
  Adresse: 'Médina',
  Montant: 5000,
  'Type de paiement': 'wave',
  "Date d'inscription": '15/05/2026',
  ...overrides,
});

describe('toIsoDate (QA-05, QA-16)', () => {
  it('convertit un numéro de série Excel sans effet de fuseau', () => {
    expect(toIsoDate(serial(2026, 4, 3))).toBe('2026-04-03');
    expect(toIsoDate(serial(2024, 2, 29))).toBe('2024-02-29');
    expect(toIsoDate(serial(2026, 4, 3) + 0.75)).toBe('2026-04-03'); // date + heure
  });

  it('lit jj/mm/aaaa (/ . -) et AAAA-MM-JJ, jour réel exigé', () => {
    expect(toIsoDate('03/04/2026')).toBe('2026-04-03');
    expect(toIsoDate('3.4.2026')).toBe('2026-04-03');
    expect(toIsoDate('03-04-2026')).toBe('2026-04-03');
    expect(toIsoDate(' 2026-04-03 ')).toBe('2026-04-03');
    expect(toIsoDate('29/02/2024')).toBe('2024-02-29');
  });

  it.each(['31/02/2026', '29/02/2025', '2026-02-30', '4/3/26', '2026/04/03', 'demain', ''])('refuse « %s »', (s) => {
    expect(toIsoDate(s)).toBeNull();
  });

  it('refuse 0, négatif, NaN et types inattendus', () => {
    expect(toIsoDate(0)).toBeNull();
    expect(toIsoDate(-5)).toBeNull();
    expect(toIsoDate(Number.NaN)).toBeNull();
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate(new Date())).toBeNull();
  });
});

describe('parsePaymentType', () => {
  it.each([
    ['wave', 'wave'],
    ['Wave', 'wave'],
    ['Orange Money', 'orange_money'],
    ['OM', 'orange_money'],
    ['Espèce', 'cash'],
    ['espece', 'cash'],
    ['Espèces', 'cash'],
    ['especes', 'cash'],
    ['cash', 'cash'],
    ['Liquide', 'cash'],
  ])('« %s » -> %s', (input, expected) => {
    expect(parsePaymentType(input)).toBe(expected);
  });

  it('renvoie null pour une valeur inconnue ou vide', () => {
    expect(parsePaymentType('chèque')).toBeNull();
    expect(parsePaymentType('')).toBeNull();
    expect(parsePaymentType(undefined)).toBeNull();
  });
});

describe('analyzeHeaders (QA-03)', () => {
  it('reconnaît les en-têtes de NOTRE export (parenthèses, apostrophe typographique)', () => {
    const exportHeaders = [
      'Activité', 'Nom', 'Prénoms', 'Téléphone', 'Adresse', "Date d'inscription",
      'Montant (F CFA)', 'Type de paiement', 'Date de création',
    ];
    const result = analyzeHeaders(exportHeaders);
    expect(result.missingColumns).toEqual([]);
    expect(result.unrecognizedHeaders).toEqual([]);
    expect(normalizeHeader('Date d’inscription')).toBe(normalizeHeader("Date d'inscription"));
    expect(analyzeHeaders(['Mode paiement']).present.has('paymentType')).toBe(true);
  });

  it('signale chaque colonne attendue absente et les en-têtes non reconnus', () => {
    const result = analyzeHeaders(['Nom', 'Prénoms', 'Téléphone', 'Adresse', 'Réglé par', '__EMPTY_1']);
    expect(result.missingColumns).toEqual(['amount', 'paymentType', 'registrationDate']);
    expect(result.unrecognizedHeaders).toEqual(['Réglé par']);
  });
});

describe('validateRows', () => {
  it('importe une ligne correcte et calcule le total', () => {
    const result = validateRows([row(), row({ Nom: 'Sow', Montant: 3000 })], ACTIVITY, []);
    expect(result.valid).toHaveLength(2);
    expect(result.totalAmount).toBe(8000);
    expect(result.valid[0].data).toMatchObject({ amount: 5000, paymentType: 'wave', registrationDate: '2026-05-15', activityId: 'act-1' });
    expect(result.valid[0].rowNumber).toBe(2);
  });

  it('refuse « 5,000 » au lieu de le lire 5 F (QA-02) et explique pourquoi', () => {
    const result = validateRows([row({ Montant: '5,000' })], ACTIVITY, []);
    expect(result.valid).toHaveLength(0);
    expect(result.invalid[0].errors.join(' ')).toMatch(/Montant illisible/);
  });

  it('montant vide : montant par défaut de l’activité, sinon erreur', () => {
    expect(validateRows([row({ Montant: '' })], ACTIVITY, []).valid[0].amount).toBe(5000);
    const free = validateRows([row({ Montant: '' })], FREE_ACTIVITY, []);
    expect(free.invalid[0].errors.join(' ')).toMatch(/Montant manquant/);
  });

  it('accepte 0 F (D1, activité gratuite)', () => {
    expect(validateRows([row({ Montant: 0 })], FREE_ACTIVITY, []).valid[0].amount).toBe(0);
  });

  it('colonne paiement absente : signalée, espèces par défaut ; cellule inconnue : erreur', () => {
    const { 'Type de paiement': _omit, ...withoutPayment } = row();
    void _omit;
    const missing = validateRows([withoutPayment], ACTIVITY, []);
    expect(missing.missingColumns).toContain('paymentType');
    expect(missing.valid[0].data?.paymentType).toBe('cash');
    const unknown = validateRows([row({ 'Type de paiement': 'chèque' })], ACTIVITY, []);
    expect(unknown.invalid[0].errors.join(' ')).toMatch(/Mode de paiement inconnu.*\(espèces, wave ou orange money\)/);
    const blank = validateRows([row({ 'Type de paiement': '' })], ACTIVITY, []);
    expect(blank.invalid[0].errors.join(' ')).toMatch(/Mode de paiement manquant/);
  });

  it('cumule les erreurs d’identité, de longueur et de date', () => {
    const result = validateRows(
      [row({ Nom: '', 'Prénoms': 'x'.repeat(101), 'Téléphone': '12', Adresse: '', "Date d'inscription": '31/02/2026' })],
      ACTIVITY,
      []
    );
    const errors = result.invalid[0].errors.join(' | ');
    expect(errors).toMatch(/Nom manquant/);
    expect(errors).toMatch(/trop long/);
    expect(errors).toMatch(/Téléphone invalide/);
    expect(errors).not.toMatch(/Adresse/); // D19 : adresse facultative
    expect(errors).toMatch(/Date illisible/);
  });

  it('adresse vide ou colonne absente : ligne valide, chaîne vide stockée (D19)', () => {
    const blank = validateRows([row({ Adresse: '   ' })], ACTIVITY, []);
    expect(blank.invalid).toHaveLength(0);
    expect(blank.valid[0].data?.address).toBe('');

    const withoutAddress = Object.fromEntries(Object.entries(row()).filter(([k]) => k !== 'Adresse'));
    const missing = validateRows([withoutAddress], ACTIVITY, []);
    expect(missing.invalid).toHaveLength(0);
    expect(missing.valid[0].data?.address).toBe('');
    expect(missing.missingColumns).not.toContain('address');
  });

  it('refuse une adresse trop longue et un téléphone vide', () => {
    const result = validateRows([row({ Adresse: 'a'.repeat(201), 'Téléphone': '' })], ACTIVITY, []);
    const errors = result.invalid[0].errors.join(' | ');
    expect(errors).toMatch(/Adresse trop longue/);
    expect(errors).toMatch(/Téléphone manquant/);
  });

  it('détecte les doublons dans le fichier et avec l’existant (clé téléphone, QA-22)', () => {
    const existing: Registration = {
      id: 'r1', firstName: 'Awa', lastName: 'DIOP', phone: '+221771234567', address: 'x',
      registrationDate: '2026-01-01', paymentType: 'cash', amount: 1, activityId: 'act-1', createdAt: 1,
    };
    const result = validateRows(
      [row(), row({ Nom: 'Ba', 'Téléphone': '771234500' }), row({ Nom: 'Ba', 'Téléphone': '0771234500' })],
      ACTIVITY,
      [existing]
    );
    expect(result.duplicates.map((r) => r.rowNumber)).toEqual([2, 4]);
    expect(result.valid.map((r) => r.rowNumber)).toEqual([3]);
    expect(result.totalAmount).toBe(5000);
  });

  it('l’existant d’une AUTRE activité n’est pas un doublon', () => {
    const other: Registration = {
      id: 'r1', firstName: 'Awa', lastName: 'Diop', phone: '771234567', address: 'x',
      registrationDate: '2026-01-01', paymentType: 'cash', amount: 1, activityId: 'autre', createdAt: 1,
    };
    expect(validateRows([row()], ACTIVITY, [other]).valid).toHaveLength(1);
  });
});

describe('parseFile sur de vrais classeurs', () => {
  it('lit 5 000 au format « # ##0 » et une date au format court comme des valeurs, pas du texte (QA-02, QA-05)', async () => {
    const amountCell: XLSX.CellObject = { t: 'n', v: 5000, z: '#,##0' };
    const dateCell: XLSX.CellObject = { t: 'n', v: serial(2026, 4, 3), z: 'm/d/yy' };
    const file = sheetFile([
      [{ t: 's', v: 'Nom' }, { t: 's', v: 'Prénoms' }, { t: 's', v: 'Téléphone' }, { t: 's', v: 'Adresse' }, { t: 's', v: 'Montant' }, { t: 's', v: 'Type de paiement' }, { t: 's', v: "Date d'inscription" }],
      [{ t: 's', v: 'Diop' }, { t: 's', v: 'Awa' }, { t: 's', v: '0771234567' }, { t: 's', v: 'Médina' }, amountCell, { t: 's', v: 'Wave' }, dateCell],
    ]);
    const rows = await parseFile(file);
    const result = validateRows(rows, ACTIVITY, []);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].data).toMatchObject({ amount: 5000, registrationDate: '2026-04-03', phone: '0771234567' });
  });

  it('aller-retour export -> import sans perte (montants, modes, dates)', async () => {
    const regs: Registration[] = [
      { id: 'a', firstName: 'Awa', lastName: 'Diop', phone: '+221 77 123 45 67', address: 'Médina', registrationDate: '2026-04-03', paymentType: 'orange_money', amount: 15000, activityId: 'act-1', createdAt: 1 },
      { id: 'b', firstName: 'Modou', lastName: 'Fall', phone: '781234567', address: 'Thiès', registrationDate: '2026-12-01', paymentType: 'cash', amount: 0, activityId: 'act-1', createdAt: 2 },
      { id: 'c', firstName: 'Fatou', lastName: 'Sarr', phone: '761234567', address: 'Yoff', registrationDate: '2026-01-11', paymentType: 'wave', amount: 1500000, activityId: 'act-1', createdAt: 3 },
    ];
    captured.workbooks.length = 0;
    exportToExcel(regs, [ACTIVITY], 'test');
    expect(captured.workbooks).toHaveLength(1);
    const rows = await parseFile(workbookFile(captured.workbooks[0] as XLSX.WorkBook));
    expect(rows.map((r) => r['Type de paiement'])).toEqual(['Orange Money', 'Espèces', 'Wave']); // libellé exporté
    const result = validateRows(rows, FREE_ACTIVITY, []);
    expect(result.missingColumns).toEqual([]);
    expect(result.unrecognizedHeaders).toEqual([]);
    expect(result.invalid).toEqual([]);
    expect(result.valid.map((r) => r.data && [r.data.amount, r.data.paymentType, r.data.registrationDate, r.data.phone])).toEqual(
      regs.map((r) => [r.amount, r.paymentType, r.registrationDate, r.phone])
    );
    expect(result.totalAmount).toBe(1515000);
  });

  it('le modèle téléchargeable se réimporte sans erreur', async () => {
    captured.workbooks.length = 0;
    downloadTemplate();
    const rows = await parseFile(workbookFile(captured.workbooks[0] as XLSX.WorkBook));
    const result = validateRows(rows, ACTIVITY, []);
    expect(result.invalid).toEqual([]);
    expect(result.valid.map((r) => r.data?.registrationDate)).toEqual(['2026-05-15', '2026-05-16']);
    expect(result.totalAmount).toBe(8000);
  });

  it('refuse un fichier de plus de 5 Mo avant lecture', async () => {
    const big = new File([new Uint8Array(MAX_IMPORT_FILE_BYTES + 1)], 'gros.xlsx');
    await expect(parseFile(big)).rejects.toThrow(/5 Mo/);
  });

  it('refuse plus de 5000 lignes', async () => {
    const rows: (string | number)[][] = [['Nom'], ...Array.from({ length: 5001 }, (_, i) => [`n${i}`])];
    await expect(parseFile(sheetFile(rows))).rejects.toThrow(/5000 maximum/);
  });

  it('CSV « ; » : « 5 000 » et une date jour > 12 sont bien lus', async () => {
    const rows = await parseFile(csvFile(`${CSV_HEADER}\nDiop;Awa;771234567;Médina;5 000;wave;15/05/2026\n`));
    const result = validateRows(rows, ACTIVITY, []);
    expect(result.valid[0].data).toMatchObject({ amount: 5000, registrationDate: '2026-05-15', address: 'Médina' });
  });

  // Non-régression QA7-01 (07-qa.md) : SheetJS lisait « 03/04/2026 » à l'américaine (4 mars)
  // avant notre parseur jj/mm/aaaa. Les CSV sont désormais lus en texte brut (spreadsheet.ts).
  it('CSV : « 03/04/2026 » est lu 3 avril, pas 4 mars (QA7-01)', async () => {
    const rows = await parseFile(csvFile(`${CSV_HEADER}\nDiop;Awa;771234567;Médina;5000;wave;03/04/2026\n`));
    const result = validateRows(rows, ACTIVITY, []);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].data?.registrationDate).toBe('2026-04-03');
  });

  // Non-régression QA7-02 (07-qa.md) : un CSV UTF-8 SANS BOM (LibreOffice, Google Sheets)
  // était lu en Latin-1 (« Médina » devenait « MÃ©dina »).
  it('CSV UTF-8 sans BOM : accents conservés (QA7-02)', async () => {
    const rows = await parseFile(csvFile(`${CSV_HEADER}\nDiop;Awa;771234567;Médina;5000;wave;15/05/2026\n`, false));
    expect(validateRows(rows, ACTIVITY, []).valid[0]?.data?.address).toBe('Médina');
  });

  it('CSV windows-1252 (« CSV (séparateur : point-virgule) » d’Excel FR) : repli sur 1252, accents conservés', async () => {
    const text = `${CSV_HEADER}\nBâ;Aïssatou;771234567;Médina;5 000;espèce;03/04/2026\n`;
    // Les caractères utilisés ici ont le même code en windows-1252 qu'en Latin-1 (U+00A0 à U+00FF).
    const file = new File([new Uint8Array([...text].map((ch) => ch.charCodeAt(0)))], 'import.csv');
    const result = validateRows(await parseFile(file), ACTIVITY, []);
    expect(result.valid[0]?.data).toMatchObject({
      lastName: 'Bâ', firstName: 'Aïssatou', address: 'Médina', amount: 5000, registrationDate: '2026-04-03',
    });
  });
});
