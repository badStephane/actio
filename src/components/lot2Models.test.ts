import { describe, expect, it } from 'vitest';
import type { Activity, Registration } from '../types';
import { activityStatus, daysBetweenIso, pickCurrentActivity } from './currentActivity';
import { breakdownOf, computeHomeStats } from './homeStats';
import { formatAxisAmount, formatDateLong, formatDateShort } from './uiFormat';
import {
  LIST_MEMORY_KEY,
  applyFilters,
  defaultListState,
  readListMemory,
  resolveInitialListState,
  writeListMemory,
} from './registrationListModel';

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(i: number) { return [...this.data.keys()][i] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

const act = (o: Partial<Activity>): Activity => ({ id: 'a', name: 'A', color: '#000', createdAt: 1, ...o });
const reg = (i: number, o: Partial<Registration> = {}): Registration => ({
  id: `r${i}`, firstName: 'Awa', lastName: `Nom${i}`, phone: '77 123 45 67', address: '', registrationDate: '2026-11-07',
  paymentType: 'cash', amount: 2500, activityId: 'plage', createdAt: i, ...o,
});

const TODAY = '2026-11-07';

describe('pickCurrentActivity (U11)', () => {
  const general = act({ id: 'general', createdAt: 1 });
  const ancienne = act({ id: 'ancienne', eventDate: '2026-03-01', createdAt: 10 });
  const recente = act({ id: 'recente', eventDate: '2026-10-20', createdAt: 2 });
  const futureLoin = act({ id: 'loin', eventDate: '2027-05-01', createdAt: 3 });
  const futureProche = act({ id: 'proche', eventDate: '2026-11-20', createdAt: 4 });

  it('la prochaine activité à venir d’abord, même si une autre a été créée après', () => {
    expect(pickCurrentActivity([general, ancienne, futureLoin, futureProche], TODAY)?.id).toBe('proche');
  });

  it('aucune à venir : la plus récemment passée, pas la dernière créée', () => {
    expect(pickCurrentActivity([general, ancienne, recente], TODAY)?.id).toBe('recente');
  });

  it('aucune date : la dernière créée ; archivées ignorées ; aucune vivante : null', () => {
    expect(pickCurrentActivity([general, act({ id: 'b', createdAt: 5 })], TODAY)?.id).toBe('b');
    expect(pickCurrentActivity([act({ id: 'x', eventDate: '2026-12-01', archivedAt: 1 }), general], TODAY)?.id).toBe('general');
    expect(pickCurrentActivity([act({ archivedAt: 1 })], TODAY)).toBeNull();
  });
});

describe('statut d’activité toujours vrai (U11)', () => {
  it('Dans N jours, Aujourd’hui, Terminée, sans date', () => {
    expect(activityStatus({ eventDate: '2026-11-19' }, TODAY)).toEqual({ kind: 'upcoming', days: 12 });
    expect(activityStatus({ eventDate: '2026-11-08' }, TODAY)).toEqual({ kind: 'upcoming', days: 1 });
    expect(activityStatus({ eventDate: TODAY }, TODAY)).toEqual({ kind: 'today' });
    expect(activityStatus({ eventDate: '2026-08-03' }, TODAY)).toEqual({ kind: 'past', eventDate: '2026-08-03' });
    expect(activityStatus({}, TODAY)).toEqual({ kind: 'undated' });
  });

  it('écart en jours exact, y compris au passage de l’heure d’été et d’une année', () => {
    expect(daysBetweenIso('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetweenIso('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetweenIso('2026-11-07', '2026-08-03')).toBe(-96);
  });
});

describe('indicateurs de l’accueil (U12, U13)', () => {
  const rows = [
    reg(1), reg(2, { paymentType: 'wave', amount: 3000 }), reg(3, { registrationDate: '2026-11-02' }),
    reg(4, { registrationDate: '2026-10-30', paymentType: 'orange_money' }), reg(5, { activityId: 'autre' }),
  ];

  it('caisse du jour séparée de toute l’activité, moyenne par inscription', () => {
    const s = computeHomeStats(rows, 'plage', TODAY);
    expect(s.total).toBe(4);
    expect(s.totalAmount).toBe(10500);
    expect(s.average).toBe(2625);
    expect([s.todayCount, s.todayAmount, s.monthCount, s.monthAmount]).toEqual([2, 5500, 3, 8000]);
    expect(s.todayBreakdown.map(b => [b.type, b.count, b.amount])).toEqual([['cash', 1, 2500], ['wave', 1, 3000], ['orange_money', 0, 0]]);
    expect(s.breakdown.find(b => b.type === 'orange_money')?.count).toBe(1);
    expect(s.recent.map(r => r.id)).toEqual(['r4', 'r3', 'r2', 'r1']);
  });

  it('aucune inscription : parts à 0 sans division par zéro', () => {
    expect(breakdownOf([]).every(b => b.share === 0 && b.count === 0)).toBe(true);
    expect(computeHomeStats([], 'plage', TODAY).average).toBe(0);
  });
});

describe('formats (U18, dates sans fuseau)', () => {
  it('axe des montants exact : 2 500 et jamais « 3k »', () => {
    expect(formatAxisAmount(2500)).toMatch(/^2\s500$/);
    expect(formatAxisAmount(2500)).not.toMatch(/k/);
    expect(formatAxisAmount(0)).toBe('0');
    expect(formatAxisAmount(1500000)).toMatch(/^1\s500\s000$/);
    expect(formatAxisAmount(2499.6)).toMatch(/^2\s500$/);
  });

  it('dates longues et courtes depuis AAAA-MM-JJ', () => {
    expect(formatDateLong('2026-08-03')).toBe('3 août 2026');
    expect(formatDateShort('2026-08-03')).toBe('03/08/2026');
    expect(formatDateLong('pas une date')).toBe('pas une date');
  });
});

describe('mémoire de la Liste (U14)', () => {
  const remembered = { ...defaultListState('plage'), filters: { ...defaultListState('plage').filters, payment: 'wave' }, page: 3 };

  it('premier passage de la session : écran de choix ; ensuite la liste mémorisée', () => {
    expect(resolveInitialListState(null, '')).toEqual({ state: defaultListState(), showPicker: true });
    expect(resolveInitialListState(remembered, '')).toEqual({ state: remembered, showPicker: false });
  });

  it('retour sur la même activité : même filtre et même page ; autre activité : liste neuve', () => {
    expect(resolveInitialListState(remembered, 'plage').state).toEqual(remembered);
    expect(resolveInitialListState(remembered, 'gala')).toEqual({ state: defaultListState('gala'), showPicker: false });
  });

  it('lecture et écriture en sessionStorage ; contenu invalide ignoré', () => {
    const storage = new MemoryStorage();
    expect(readListMemory(storage)).toBeNull();
    writeListMemory(remembered, storage);
    expect(readListMemory(storage)).toEqual(remembered);
    storage.setItem(LIST_MEMORY_KEY, JSON.stringify({ ...remembered, page: 0 }));
    expect(readListMemory(storage)).toBeNull();
    storage.setItem(LIST_MEMORY_KEY, '{oups');
    expect(readListMemory(storage)).toBeNull();
  });

  it('filtres combinés et tri', () => {
    const rows = [reg(1, { lastName: 'Diop' }), reg(2, { lastName: 'Ba', paymentType: 'wave' }), reg(3, { activityId: 'gala' })];
    const f = { ...defaultListState('plage').filters };
    expect(applyFilters(rows, f, 'name', 'asc').map(r => r.id)).toEqual(['r2', 'r1']);
    expect(applyFilters(rows, { ...f, payment: 'wave' }, null, 'asc').map(r => r.id)).toEqual(['r2']);
    expect(applyFilters(rows, { ...f, search: 'dio' }, null, 'asc').map(r => r.id)).toEqual(['r1']);
  });
});

describe('libellé de la barre d’activité (Lot 3, a)', () => {
  it('« Activité en cours » seulement aujourd’hui ou à venir ; terminée : « Activité suivie » et pastille neutre', async () => {
    const { activityHeading } = await import('./currentActivity');
    expect(activityHeading({ kind: 'upcoming', days: 3 })).toEqual({ label: 'Activité en cours', isNeutralDot: false });
    expect(activityHeading({ kind: 'today' })).toEqual({ label: 'Activité en cours', isNeutralDot: false });
    expect(activityHeading({ kind: 'past', eventDate: '2026-08-03' })).toEqual({ label: 'Activité suivie', isNeutralDot: true });
    expect(activityHeading({ kind: 'undated' })).toEqual({ label: 'Activité suivie', isNeutralDot: false });
  });
});
