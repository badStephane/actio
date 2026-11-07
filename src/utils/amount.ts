/** Plafond d'un montant d'inscription en francs CFA (garde-fou contre les erreurs de saisie). */
export const MAX_AMOUNT_XOF = 100_000_000;

/** Espaces ordinaires, insécables (U+00A0) et fines insécables (U+202F) utilisées par Excel FR. */
const SPACES = /[\s\u00a0\u202f]/g;
/** Suffixes monétaires tolérés, après retrait des espaces. */
const CURRENCY_SUFFIX = /(fcfa|cfa|xof|f)$/i;
const DIGITS_ONLY = /^\d+$/;

const inRange = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= MAX_AMOUNT_XOF;

/**
 * Entier XOF >= 0. Accepte un number entier, ou une chaîne avec espaces / espaces insécables /
 * « F » / « FCFA ». Refuse décimales, séparateurs ambigus (« 5,000 », « 5.000 »), négatifs, NaN.
 * Renvoie null si la valeur n'est pas un montant valide (y compris vide).
 */
export const parseAmountXof = (input: unknown): number | null => {
  if (typeof input === 'number') return inRange(input) ? input : null;
  if (typeof input !== 'string') return null;
  const compact = input.replace(SPACES, '').replace(CURRENCY_SUFFIX, '');
  if (!DIGITS_ONLY.test(compact)) return null;
  const n = Number(compact);
  return inRange(n) ? n : null;
};
