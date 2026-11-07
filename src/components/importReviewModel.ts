import { Registration } from '../types';
import { SuspiciousRegistration, SuspicionReason } from '../utils/importReview';

export const REASON_LABEL: Record<SuspicionReason, string> = {
  amount_too_small: 'Montant probablement divisé par 1000',
  non_integer: 'Montant non entier (probablement mal lu à l\'import)',
  date_ambiguous: 'Date jour/mois possiblement inversée',
};

/** « 2026-03-04 » → « 04/03/2026 » sans passer par Date (pas de décalage de fuseau). */
export const formatIsoDate = (iso: string): string => {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

export const hasSuggestion = (s: SuspiciousRegistration): boolean =>
  (s.suggestedAmount !== undefined && s.suggestedAmount !== s.registration.amount) ||
  (s.suggestedDate !== undefined && s.suggestedDate !== s.registration.registrationDate);

/** Inscription corrigée avec les valeurs suggérées (nouvel objet, l'original n'est pas modifié). */
export const applySuggestion = (s: SuspiciousRegistration): Omit<Registration, 'createdAt'> => {
  const { createdAt: _createdAt, ...rest } = s.registration;
  void _createdAt;
  return {
    ...rest,
    amount: s.suggestedAmount ?? rest.amount,
    registrationDate: s.suggestedDate ?? rest.registrationDate,
  };
};
