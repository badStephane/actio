import { describe, expect, it } from 'vitest';
import { MAX_AMOUNT_XOF, parseAmountXof } from './amount';

// Corpus de la revue QA (QA-02, QA-17) : un montant ambigu est REFUSÉ (null), jamais deviné.
describe('parseAmountXof', () => {
  it.each([
    ['5000', 5000],
    ['1 500', 1500],
    ['1 500 F', 1500],
    ['1500 FCFA', 1500],
    ['1500 fcfa', 1500],
    ['2500 CFA', 2500],
    ['3000 XOF', 3000],
    ['1 500', 1500], // espace insécable (Excel FR)
    ['1 500', 1500], // espace fine insécable
    ['  750  ', 750],
    ['0', 0],
    ['0005', 5],
  ])('accepte « %s » -> %d', (input, expected) => {
    expect(parseAmountXof(input)).toBe(expected);
  });

  it.each([
    '5,000', // séparateur de milliers anglo-saxon : la cause de QA-02
    '5.000',
    '1,500,000',
    '1 500,50',
    '1500.5',
    '12abc',
    '5e3',
    '-200',
    '- 5',
    '',
    '   ',
    'F',
    'FCFA',
    'gratuit',
    '1500 francs',
    '0x10',
    'Infinity',
  ])('refuse « %s »', (input) => {
    expect(parseAmountXof(input)).toBeNull();
  });

  it('accepte un nombre entier et refuse décimal, négatif, NaN et infini', () => {
    expect(parseAmountXof(5000)).toBe(5000);
    expect(parseAmountXof(0)).toBe(0);
    expect(parseAmountXof(5000.0)).toBe(5000);
    expect(parseAmountXof(1500.5)).toBeNull();
    expect(parseAmountXof(1.5)).toBeNull();
    expect(parseAmountXof(-1)).toBeNull();
    expect(parseAmountXof(Number.NaN)).toBeNull();
    expect(parseAmountXof(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('borne au plafond MAX_AMOUNT_XOF, nombre comme chaîne', () => {
    expect(parseAmountXof(MAX_AMOUNT_XOF)).toBe(MAX_AMOUNT_XOF);
    expect(parseAmountXof(MAX_AMOUNT_XOF + 1)).toBeNull();
    expect(parseAmountXof(String(MAX_AMOUNT_XOF))).toBe(MAX_AMOUNT_XOF);
    expect(parseAmountXof(String(MAX_AMOUNT_XOF + 1))).toBeNull();
    expect(parseAmountXof('99999999999999999999')).toBeNull();
  });

  it('refuse les types non pris en charge', () => {
    expect(parseAmountXof(null)).toBeNull();
    expect(parseAmountXof(undefined)).toBeNull();
    expect(parseAmountXof(true)).toBeNull();
    expect(parseAmountXof({})).toBeNull();
    expect(parseAmountXof([5000])).toBeNull();
  });
});
