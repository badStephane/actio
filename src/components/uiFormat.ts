/** Montant entier en francs CFA, ex. « 5 000 F ». */
export const formatAmount = (amount: number): string =>
  `${new Intl.NumberFormat('fr-FR').format(Math.round(amount))} F`;

/**
 * Message lisible pour l'utilisateur. La couche données lève des `Error`
 * avec un message en français (contrat 03) ; sinon on utilise le repli.
 */
export const errorMessage = (err: unknown, fallback: string): string => {
  if (err instanceof Error && err.message.trim()) return err.message;
  if (typeof err === 'string' && err.trim()) return err;
  return fallback;
};

export const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
};

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

const isoParts = (iso: string): [number, number, number] | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

/** « 3 août 2026 » à partir de 'AAAA-MM-JJ', sans objet Date (aucun décalage de fuseau). */
export const formatDateLong = (iso: string): string => {
  const p = isoParts(iso);
  return p && MONTHS[p[1] - 1] ? `${p[2]} ${MONTHS[p[1] - 1]} ${p[0]}` : iso;
};

/** « 03/08/2026 » à partir de 'AAAA-MM-JJ', sans objet Date. */
export const formatDateShort = (iso: string): string => {
  const p = isoParts(iso);
  return p ? `${String(p[2]).padStart(2, '0')}/${String(p[1]).padStart(2, '0')}/${p[0]}` : iso;
};

/**
 * Axe des montants (U18) : valeur exacte groupée par milliers avec une espace fine insécable,
 * « 2 500 », jamais « 3k ». Groupage fait ici : selon la version d'ICU, Intl ne groupe pas
 * toujours les nombres de 4 chiffres (« 1500 » observé dans Chrome).
 */
export const formatAxisAmount = (value: number): string =>
  String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
