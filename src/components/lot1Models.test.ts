import { describe, expect, it } from 'vitest';
import type { Activity, Registration } from '../types';
import {
  DEFAULT_PAYMENT_TYPE,
  PAYMENT_META,
  PAYMENT_METAS,
  PAYMENT_ORDER,
  paymentLabel,
  paymentTypeForKey,
} from './paymentMeta';
import {
  MAX_SESSION_ENTRIES,
  SESSION_ENTRIES_KEY,
  SessionEntry,
  addSessionEntry,
  computeSessionTotals,
  entriesForActivity,
  readSessionEntries,
  reconcileSessionEntries,
  writeSessionEntries,
} from './sessionEntries';
import {
  MAX_SAMPLE_MS,
  MAX_TIMING_SAMPLES,
  TIMING_SAMPLES_KEY,
  formatDuration,
  isTimingEnabled,
  median,
  readTimingSamples,
  recordTimingSample,
  setTimingEnabled,
} from './entryTiming';
import { isNewRegistrationShortcut } from './shortcuts';
import { isPastActivity, resolveGuichetActivity } from './currentActivity';
import {
  RegistrationFormState,
  createEmptyForm,
  displayName,
  duplicateMessage,
  firstInvalidField,
  formatAmountInput,
  resetFormAfterSave,
  validateRegistrationForm,
} from './registrationFormModel';

/** Storage en mémoire (environnement node, sans localStorage). */
class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

const activity = (overrides: Partial<Activity>): Activity => ({
  id: 'a', name: 'A', color: '#000', createdAt: 1, ...overrides,
});

const entry = (i: number, overrides: Partial<SessionEntry> = {}): SessionEntry => ({
  id: `r${i}`, lastName: 'Diop', firstName: 'Awa', amount: 2500, paymentType: 'cash',
  activityId: 'plage', createdAt: i, ...overrides,
});

describe('paymentMeta : source unique des modes (U6, U21, U24)', () => {
  it('ordre fixe Espèces, Wave, Orange Money, libellé « Espèces » au pluriel', () => {
    expect(PAYMENT_ORDER).toEqual(['cash', 'wave', 'orange_money']);
    expect(PAYMENT_METAS.map(m => m.label)).toEqual(['Espèces', 'Wave', 'Orange Money']);
    expect(paymentLabel('cash')).toBe('Espèces');
    expect(DEFAULT_PAYMENT_TYPE).toBe('cash');
  });

  it('touches 1, 2, 3 associées aux modes, toute autre touche ignorée', () => {
    expect(PAYMENT_METAS.map(m => m.shortcut)).toEqual(['1', '2', '3']);
    expect(paymentTypeForKey('2')).toBe('wave');
    expect(paymentTypeForKey('3')).toBe('orange_money');
    expect(paymentTypeForKey('4')).toBeUndefined();
    expect(paymentTypeForKey('a')).toBeUndefined();
  });

  it('chaque mode a une icône, une couleur distincte et un texte blanc quand il est choisi', () => {
    const hexes = PAYMENT_METAS.map(m => m.hex);
    expect(new Set(hexes).size).toBe(3);
    PAYMENT_METAS.forEach(m => {
      expect(m.logo).toBeTruthy();
      expect(m.selectedClass).toContain('text-white');
      expect(PAYMENT_META[m.type]).toBe(m);
    });
    // Wave ne reprend plus le bleu du bouton primaire (#2563B8).
    expect(PAYMENT_META.wave.hex).not.toBe('#2563B8');
  });
});

describe('sessionEntries : panneau « Saisies de cette session » (1.3)', () => {
  it('ajoute en tête, sans doublon, en gardant les 20 plus récentes', () => {
    const many = Array.from({ length: MAX_SESSION_ENTRIES }, (_, i) => entry(i));
    const next = addSessionEntry(many, entry(99));
    expect(next).toHaveLength(MAX_SESSION_ENTRIES);
    expect(next[0].id).toBe('r99');
    expect(addSessionEntry([entry(1)], entry(1, { amount: 5000 }))).toEqual([entry(1, { amount: 5000 })]);
  });

  it('plafond par activité : les saisies d’une autre activité restent en mémoire', () => {
    const gala = Array.from({ length: 3 }, (_, i) => entry(100 + i, { activityId: 'gala' }));
    const plage = Array.from({ length: MAX_SESSION_ENTRIES }, (_, i) => entry(i));
    const next = addSessionEntry([...plage, ...gala], entry(99));
    expect(entriesForActivity(next, 'plage')).toHaveLength(MAX_SESSION_ENTRIES);
    expect(entriesForActivity(next, 'plage')[0].id).toBe('r99');
    expect(entriesForActivity(next, 'gala').map(e => e.id)).toEqual(['r100', 'r101', 'r102']);
  });

  it('le panneau ne totalise que l’activité du guichet (décision PM)', () => {
    const entries = [entry(1), entry(2, { activityId: 'gala', amount: 5000 }), entry(3, { paymentType: 'wave' })];
    const totals = computeSessionTotals(entriesForActivity(entries, 'plage'));
    expect(totals.count).toBe(2);
    expect(totals.amount).toBe(5000);
    expect(entriesForActivity(entries, 'inconnue')).toEqual([]);
  });

  it('totaux : somme des lignes, une pastille par mode dans l\'ordre fixe', () => {
    const entries = [
      entry(1), entry(2, { paymentType: 'wave' }), entry(3), entry(4, { paymentType: 'orange_money', amount: 5000 }),
      entry(5, { paymentType: 'wave' }), entry(6),
    ];
    const totals = computeSessionTotals(entries);
    expect(totals.count).toBe(6);
    expect(totals.amount).toBe(17500);
    expect(totals.byPayment).toEqual([
      { type: 'cash', count: 3, amount: 7500 },
      { type: 'wave', count: 2, amount: 5000 },
      { type: 'orange_money', count: 1, amount: 5000 },
    ]);
    expect(totals.byPayment.reduce((s, p) => s + p.amount, 0)).toBe(totals.amount);
  });

  it('réalignement : supprimée ailleurs retirée, modifiée mise à jour, non vérifiée gardée', () => {
    const edited = { ...entry(2), amount: 3000, paymentType: 'wave', address: '', phone: '77', registrationDate: '2026-11-07' } as Registration;
    const result = reconcileSessionEntries(
      [entry(1), entry(2), entry(3)],
      new Map<string, Registration | null>([['r1', null], ['r2', edited]])
    );
    expect(result.map(e => e.id)).toEqual(['r2', 'r3']);
    expect(result[0]).toMatchObject({ amount: 3000, paymentType: 'wave', createdAt: 2 });
  });

  it('lecture et écriture en sessionStorage ; contenu illisible = session vide', () => {
    const storage = new MemoryStorage();
    writeSessionEntries([entry(1)], storage);
    expect(readSessionEntries(storage)).toEqual([entry(1)]);
    storage.setItem(SESSION_ENTRIES_KEY, '{pas du json');
    expect(readSessionEntries(storage)).toEqual([]);
    storage.setItem(SESSION_ENTRIES_KEY, JSON.stringify([{ id: 1 }, entry(2, { paymentType: 'cheque' as never })]));
    expect(readSessionEntries(storage)).toEqual([]);
  });
});

describe('entryTiming : chronométrage local (D22)', () => {
  it('désactivé par défaut : aucune mesure enregistrée', () => {
    const storage = new MemoryStorage();
    expect(isTimingEnabled(storage)).toBe(false);
    expect(recordTimingSample(12_000, storage)).toBe(false);
    expect(readTimingSamples(storage)).toEqual([]);
  });

  it('activé : enregistre les durées plausibles, garde les 200 dernières', () => {
    const storage = new MemoryStorage();
    setTimingEnabled(true, storage);
    expect(recordTimingSample(12_345.6, storage)).toBe(true);
    expect(recordTimingSample(0, storage)).toBe(false);
    expect(recordTimingSample(MAX_SAMPLE_MS + 1, storage)).toBe(false);
    expect(readTimingSamples(storage)).toEqual([12_346]);
    storage.setItem(TIMING_SAMPLES_KEY, JSON.stringify(Array.from({ length: MAX_TIMING_SAMPLES }, () => 1000)));
    recordTimingSample(2000, storage);
    const samples = readTimingSamples(storage);
    expect(samples).toHaveLength(MAX_TIMING_SAMPLES);
    expect(samples[samples.length - 1]).toBe(2000);
    setTimingEnabled(false, storage);
    expect(isTimingEnabled(storage)).toBe(false);
  });

  it('médiane et format lisible', () => {
    expect(median([])).toBeNull();
    expect(median([30, 10, 20])).toBe(20);
    expect(median([40, 10, 30, 20])).toBe(25);
    expect(formatDuration(42_400)).toBe('42 s');
    expect(formatDuration(65_000)).toBe('1 min 05 s');
  });
});

describe('raccourci Nouvelle inscription (D22)', () => {
  const key = (k: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({
    key: k, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods,
  });

  it('Ctrl+N, Cmd+N et F2 ; pas N seul, ni Ctrl+Maj+N, ni Ctrl+F2', () => {
    expect(isNewRegistrationShortcut(key('n', { ctrlKey: true }))).toBe(true);
    expect(isNewRegistrationShortcut(key('N', { ctrlKey: true }))).toBe(true);
    expect(isNewRegistrationShortcut(key('n', { metaKey: true }))).toBe(true);
    expect(isNewRegistrationShortcut(key('F2'))).toBe(true);
    expect(isNewRegistrationShortcut(key('n'))).toBe(false);
    expect(isNewRegistrationShortcut(key('N', { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isNewRegistrationShortcut(key('F2', { ctrlKey: true }))).toBe(false);
  });
});

describe('activité du guichet (1.1)', () => {
  const general = activity({ id: 'general', name: 'Général', createdAt: 1 });
  const plage = activity({ id: 'plage', eventDate: '2099-08-03', defaultAmount: 2500, createdAt: 2 });
  const gala = activity({ id: 'gala', eventDate: '2020-01-01', defaultAmount: 5000, createdAt: 3 });
  const archived = activity({ id: 'old', archivedAt: 5, createdAt: 4 });
  const all = [general, plage, gala, archived];

  it('priorité : ?activity= vivante, puis activité mémorisée, puis choix automatique', () => {
    expect(resolveGuichetActivity(all, 'gala', 'plage')?.id).toBe('gala');
    expect(resolveGuichetActivity(all, null, 'gala')?.id).toBe('gala');
    expect(resolveGuichetActivity(all, 'old', 'old')?.id).toBe('plage'); // archivée ignorée, prochaine à venir
    expect(resolveGuichetActivity(all, 'inconnue', '')?.id).toBe('plage');
    expect(resolveGuichetActivity([], null, '')).toBeNull();
  });

  it('événement passé détecté sur la date locale', () => {
    expect(isPastActivity(gala, '2026-11-07')).toBe(true);
    expect(isPastActivity(plage, '2026-11-07')).toBe(false);
    expect(isPastActivity(general, '2026-11-07')).toBe(false);
  });
});

describe('formulaire de saisie : enchaînement (1.2, 1.4, D19, D21)', () => {
  const plage = activity({ id: 'plage', name: 'Sortie Plage', defaultAmount: 2500 });
  const filled: RegistrationFormState = {
    lastName: 'Diop', firstName: 'Awa', phone: '77 123 45 67', address: 'Médina',
    registrationDate: '2026-11-05', paymentType: 'wave', amount: '3 000', activityId: 'plage',
  };

  it('montant formaté avec séparateur de milliers, valeur illisible inchangée', () => {
    expect(formatAmountInput('25000')).toBe('25 000');
    expect(formatAmountInput('2 500')).toBe('2 500');
    expect(formatAmountInput('1500000')).toBe('1 500 000');
    expect(formatAmountInput('0')).toBe('0');
    expect(formatAmountInput('12,5')).toBe('12,5');
  });

  it('formulaire vide : montant habituel de l\'activité, Espèces', () => {
    expect(createEmptyForm(plage)).toMatchObject({ activityId: 'plage', amount: '2 500', paymentType: 'cash', address: '' });
    expect(createEmptyForm(null).amount).toBe('');
  });

  it('après enregistrement : identité vidée, activité et date gardées, montant et Espèces remis', () => {
    expect(resetFormAfterSave(filled, plage)).toEqual({
      lastName: '', firstName: '', phone: '', address: '',
      registrationDate: '2026-11-05', paymentType: 'cash', amount: '2 500', activityId: 'plage',
    });
    expect(filled.lastName).toBe('Diop'); // l'état précédent n'est pas modifié
  });

  it('adresse facultative mais limitée à 200 caractères', () => {
    expect(validateRegistrationForm({ ...filled, address: '' })).toEqual({});
    expect(validateRegistrationForm({ ...filled, address: 'a'.repeat(201) }).address).toMatch(/trop longue/);
  });

  it('premier champ en erreur dans l\'ordre de l\'écran', () => {
    expect(firstInvalidField({ amount: 'x', firstName: 'y' })).toBe('firstName');
    expect(firstInvalidField({ registrationDate: 'x', amount: 'y' })).toBe('amount');
    expect(firstInvalidField({})).toBeUndefined();
  });

  it('doublon : message avec activité, date, montant et mode (U9)', () => {
    const existing = {
      id: 'r1', createdAt: 1, lastName: 'Diop', firstName: 'Awa', phone: '77 123 45 67', address: '',
      registrationDate: '2026-11-02', paymentType: 'wave', amount: 2500, activityId: 'plage',
    } as Registration;
    const message = duplicateMessage(existing, 'Sortie Plage');
    expect(message).toMatch(/^DIOP Awa \(77 123 45 67\) est déjà inscrit\(e\) à Sortie Plage le 02\/11\/2026 pour 2\s500\sF \(Wave\)/);
    expect(displayName({ lastName: 'Ouédraogo', firstName: 'Marie' })).toBe('OUÉDRAOGO Marie');
  });
});
