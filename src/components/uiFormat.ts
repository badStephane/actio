import { Registration } from '../types';

/** Montant entier en francs CFA, ex. « 5 000 F ». */
export const formatAmount = (amount: number): string =>
  `${new Intl.NumberFormat('fr-FR').format(Math.round(amount))} F`;

export const PAYMENT_LABEL: Record<Registration['paymentType'], string> = {
  wave: 'Wave',
  cash: 'Espèce',
  orange_money: 'Orange Money',
};

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

/** Date courte lisible, ex. « 04 mars 2026 ». */
export const formatDateLong = (iso: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(d);
};
