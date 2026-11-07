import { describe, expect, it } from 'vitest';
import type { Activity, Registration } from '../types';
import { detectSuspicious, MIN_BATCH_SIZE, ReviewRow, swappedDate } from './importReview';

const FIX_AT = 2_000_000_000_000; // instant de la migration 11
const OLD_IMPORT_AT = 1_700_000_000_123; // un ancien import : même milliseconde pour tout le lot

const act = (id: string, defaultAmount?: number): Activity => ({ id, name: id, color: '#000', createdAt: 1, defaultAmount });

let seq = 0;
const reg = (overrides: Partial<Registration> = {}): Registration => ({
  id: `r${++seq}`,
  firstName: 'A',
  lastName: 'B',
  phone: '771234567',
  address: 'x',
  registrationDate: '2026-05-20',
  paymentType: 'cash',
  amount: 5000,
  activityId: 'gala',
  createdAt: OLD_IMPORT_AT,
  ...overrides,
});

const batch = (n: number, overrides: Partial<Registration> = {}): Registration[] =>
  Array.from({ length: n }, () => reg(overrides));

describe('swappedDate', () => {
  it('inverse jour et mois quand c’est plausible', () => {
    expect(swappedDate('2026-03-04')).toBe('2026-04-03');
  });

  it.each(['2026-05-20', '2026-04-04', '2026-13-01', 'n/a'])('pas de suggestion pour %s', (iso) => {
    expect(swappedDate(iso)).toBeUndefined();
  });
});

describe('detectSuspicious (Avenant A1)', () => {
  it('signale un lot importé dont les montants < 1000 alors que l’activité vaut >= 1000', () => {
    const regs = batch(MIN_BATCH_SIZE, { amount: 5 });
    const result = detectSuspicious(regs, [act('gala', 5000)], [], FIX_AT);
    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ reasons: ['amount_too_small'], suggestedAmount: 5000, batchSize: 3 });
  });

  it('utilise la médiane du lot quand l’activité n’a pas de montant par défaut', () => {
    const regs = [...batch(3, { amount: 5000 }), reg({ amount: 5 })];
    const result = detectSuspicious(regs, [act('gala')], [], FIX_AT);
    expect(result.map((s) => s.registration.amount)).toEqual([5]);
  });

  it('ne signale pas une saisie manuelle isolée (moins de 3 dans la même seconde)', () => {
    const regs = batch(MIN_BATCH_SIZE - 1, { amount: 5, registrationDate: '2026-03-04' });
    expect(detectSuspicious(regs, [act('gala', 5000)], [], FIX_AT)).toEqual([]);
  });

  it('ne signale pas les imports faits APRÈS la migration 11 (D15)', () => {
    const regs = batch(3, { amount: 5, createdAt: FIX_AT + 10 });
    expect(detectSuspicious(regs, [act('gala', 5000)], [], FIX_AT)).toEqual([]);
  });

  describe('dates jour/mois (incident rc.1 : 392 dates justes inversées en masse)', () => {
    const IMPORTED_7_MAY = new Date(2026, 4, 7, 19, 3, 56).getTime();

    it('ne signale pas une date ambiguë mais cohérente : le 7 mai saisi le 7 mai', () => {
      const regs = batch(3, { registrationDate: '2026-05-07', createdAt: IMPORTED_7_MAY });
      expect(detectSuspicious(regs, [act('gala', 5000)], [], FIX_AT)).toEqual([]);
    });

    it('ne signale pas une date passée, même inversable : rien ne prouve l’erreur', () => {
      const regs = batch(3, { registrationDate: '2026-03-04', createdAt: IMPORTED_7_MAY });
      expect(detectSuspicious(regs, [act('gala', 5000)], [], FIX_AT)).toEqual([]);
    });

    it('signale une date postérieure à la saisie dont l’inversion tombe avant la saisie', () => {
      const regs = batch(3, { registrationDate: '2026-07-05', createdAt: IMPORTED_7_MAY });
      const [first] = detectSuspicious(regs, [act('gala', 5000)], [], FIX_AT);
      expect(first).toMatchObject({ reasons: ['date_ambiguous'], suggestedDate: '2026-05-07' });
    });

    it('ne signale pas une date future dont l’inversion reste future (inscription anticipée)', () => {
      const regs = batch(3, { registrationDate: '2026-12-11', createdAt: IMPORTED_7_MAY });
      expect(detectSuspicious(regs, [act('gala', 5000)], [], FIX_AT)).toEqual([]);
    });
  });

  it('remonte le montant d’origine des lignes non entières (amount_review) même hors lot', () => {
    const single = reg({ amount: 1500, createdAt: 5 });
    const reviews: ReviewRow[] = [{ registration_id: single.id, original_amount: 1.5, reason: 'non_integer', reviewed_at: null }];
    const [s] = detectSuspicious([single], [act('gala')], reviews, FIX_AT);
    expect(s).toMatchObject({ reasons: ['non_integer'], originalAmount: 1.5, batchSize: 0 });
  });

  it('exclut les lignes déjà revues (« C’est correct »)', () => {
    const regs = batch(3, { amount: 5 });
    const reviews: ReviewRow[] = regs.map((r) => ({ registration_id: r.id, original_amount: 5, reason: 'manual_review', reviewed_at: 1 }));
    expect(detectSuspicious(regs, [act('gala', 5000)], reviews, FIX_AT)).toEqual([]);
  });

  it('ne signale ni 0 F (gratuit) ni un lot cohérent', () => {
    expect(detectSuspicious(batch(3, { amount: 0 }), [act('gala', 5000)], [], FIX_AT)).toEqual([]);
    expect(detectSuspicious(batch(3, { amount: 5000 }), [act('gala', 5000)], [], FIX_AT)).toEqual([]);
  });

  // Risque résiduel documenté (07-qa.md) : conforme à l'avenant A1, mais un lot ENTIER divisé
  // par 1000 dans une activité sans montant par défaut a une médiane < 1000 et n'est pas signalé.
  it('limite connue : lot entièrement divisé par 1000 sans montant par défaut = non signalé', () => {
    expect(detectSuspicious(batch(5, { amount: 5 }), [act('gala')], [], FIX_AT)).toEqual([]);
  });
});
