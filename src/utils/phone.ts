/** Nombre de chiffres comparés : numéro national sans indicatif (Sénégal, Côte d'Ivoire, etc.). */
export const PHONE_KEY_DIGITS = 9;

/**
 * Clé de comparaison d'un téléphone (D9) : les 9 derniers chiffres.
 * « +221 77 123 45 67 », « 00221771234567 » et « 771234567 » donnent la même clé.
 * Un numéro saisi en nombre dans Excel (0 initial perdu) garde ses chiffres significatifs.
 */
export const phoneKey = (phone: string): string => phone.replace(/\D/g, '').slice(-PHONE_KEY_DIGITS);

/** Normalisation des noms pour la détection de doublons : casse, accents, espaces, tirets, apostrophes. */
export const nameKey = (s: string): string =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s_'’`-]+/g, '')
    .trim();

/** Clé de doublon d'une personne : nom + prénom + téléphone normalisés. */
export const personKey = (lastName: string, firstName: string, phone: string): string =>
  `${nameKey(lastName)}|${nameKey(firstName)}|${phoneKey(phone)}`;
