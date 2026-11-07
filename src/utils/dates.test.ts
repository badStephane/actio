import { describe, expect, it } from 'vitest';
import { isRealDate, isValidIsoDate, toIsoDateString, todayLocalIso } from './dates';

describe('fuseau des tests', () => {
  it('tourne en Africa/Lagos (UTC+1), sinon les tests de date locale ne prouvent rien', () => {
    expect(new Date('2026-05-14T12:00:00Z').getTimezoneOffset()).toBe(-60);
  });
});

describe('todayLocalIso (D10, QA-15)', () => {
  it('donne la date LOCALE entre 00:00 et 01:00 en UTC+1, là où toISOString donne la veille', () => {
    const justAfterLocalMidnight = new Date('2026-05-14T23:30:00Z'); // 00:30 à Cotonou
    expect(justAfterLocalMidnight.toISOString().slice(0, 10)).toBe('2026-05-14');
    expect(todayLocalIso(justAfterLocalMidnight)).toBe('2026-05-15');
  });

  it('passe correctement fin de mois et fin d’année', () => {
    expect(todayLocalIso(new Date('2026-12-31T23:15:00Z'))).toBe('2027-01-01');
    expect(todayLocalIso(new Date('2028-02-28T23:59:00Z'))).toBe('2028-02-29');
  });

  it('sans argument, renvoie le format AAAA-MM-JJ', () => {
    expect(todayLocalIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('isValidIsoDate / isRealDate (QA-16)', () => {
  it.each(['2026-05-15', '2024-02-29', '2000-02-29', '1900-01-01', '2999-12-31'])('accepte %s', (s) => {
    expect(isValidIsoDate(s)).toBe(true);
  });

  it.each([
    '2026-02-30',
    '2025-02-29', // 2025 non bissextile
    '1900-02-29', // 1900 non bissextile
    '2026-13-01',
    '2026-00-10',
    '2026-04-31',
    '2026-05-00',
    '1899-12-31',
    '3000-01-01',
    '2026-5-15',
    '15/05/2026',
    '2026-05-15T00:00:00',
    ' 2026-05-15',
    '',
  ])('refuse %s', (s) => {
    expect(isValidIsoDate(s)).toBe(false);
  });

  it('isRealDate rejette 31/02 et 29/02/2025, accepte 29/02/2024', () => {
    expect(isRealDate(2026, 2, 31)).toBe(false);
    expect(isRealDate(2025, 2, 29)).toBe(false);
    expect(isRealDate(2024, 2, 29)).toBe(true);
  });

  it('toIsoDateString complète par des zéros', () => {
    expect(toIsoDateString(2026, 3, 4)).toBe('2026-03-04');
  });
});
