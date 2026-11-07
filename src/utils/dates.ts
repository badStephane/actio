const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Date du jour 'AAAA-MM-JJ' en heure locale du poste (D10), jamais en UTC. */
export const todayLocalIso = (now: Date = new Date()): string =>
  `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

/** Vrai si (année, mois, jour) désigne un jour qui existe (rejette 30 février, 29/02 non bissextile). */
export const isRealDate = (year: number, month: number, day: number): boolean => {
  if (year < 1900 || year > 2999 || month < 1 || month > 12 || day < 1) return false;
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
};

/** Vrai si s est exactement 'AAAA-MM-JJ' et désigne un jour réel (rejette 2026-02-30, 2025-02-29). */
export const isValidIsoDate = (s: string): boolean => {
  const m = ISO_DATE.exec(s);
  return m !== null && isRealDate(Number(m[1]), Number(m[2]), Number(m[3]));
};

/** Construit 'AAAA-MM-JJ' à partir de composantes déjà validées. */
export const toIsoDateString = (year: number, month: number, day: number): string =>
  `${year}-${pad2(month)}-${pad2(day)}`;
