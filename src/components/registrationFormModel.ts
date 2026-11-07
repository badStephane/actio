import { Activity, Registration } from '../types';
import { parseAmountXof, MAX_AMOUNT_XOF } from '../utils/amount';
import { isValidIsoDate, todayLocalIso } from '../utils/dates';
import { DEFAULT_PAYMENT_TYPE, paymentLabel } from './paymentMeta';
import { formatIsoDate } from './importReviewModel';
import { formatAmount } from './uiFormat';

export interface RegistrationFormState {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  registrationDate: string;
  paymentType: Registration['paymentType'];
  amount: string;
  activityId: string;
}

export type RegistrationFormField = keyof RegistrationFormState;
export type RegistrationFormErrors = Partial<Record<RegistrationFormField, string>>;

const MIN_PHONE_DIGITS = 8;
/** Même plafond qu'à l'import (`MAX_ADDRESS_LENGTH` de utils/importRegistrations). */
export const MAX_ADDRESS_LENGTH = 200;

/** Ordre visuel et de tabulation : le premier champ en erreur reçoit le focus. */
export const FIELD_ORDER: readonly RegistrationFormField[] = [
  'activityId',
  'lastName',
  'firstName',
  'phone',
  'address',
  'paymentType',
  'amount',
  'registrationDate',
];

/** Montant affiché avec séparateur de milliers : 25000 -> « 25 000 ». Valeur illisible : inchangée. */
export const formatAmountInput = (value: string): string => {
  const amount = parseAmountXof(value);
  if (amount === null) return value;
  return String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

/** Montant habituel de l'activité, déjà formaté ; vide si l'activité n'en a pas. */
export const defaultAmountOf = (activity: Activity | undefined | null): string =>
  activity?.defaultAmount !== undefined ? formatAmountInput(String(activity.defaultAmount)) : '';

export const createEmptyForm = (activity: Activity | null, activityId = activity?.id ?? ''): RegistrationFormState => ({
  firstName: '',
  lastName: '',
  phone: '',
  address: '',
  registrationDate: todayLocalIso(),
  paymentType: DEFAULT_PAYMENT_TYPE,
  amount: defaultAmountOf(activity),
  activityId,
});

/**
 * Après un enregistrement réussi (Lot 1, 1.2) : identité vidée, activité et date gardées,
 * montant habituel remis, mode remis à Espèces (D21).
 */
export const resetFormAfterSave = (
  previous: RegistrationFormState,
  activity: Activity | undefined
): RegistrationFormState => ({
  ...previous,
  firstName: '',
  lastName: '',
  phone: '',
  address: '',
  paymentType: DEFAULT_PAYMENT_TYPE,
  amount: defaultAmountOf(activity),
});

/** Validation pure du formulaire d'inscription (D1 : montant entier >= 0 ; D19 : adresse facultative). */
export const validateRegistrationForm = (form: RegistrationFormState): RegistrationFormErrors => {
  const errors: RegistrationFormErrors = {};

  if (!form.activityId) errors.activityId = 'L\'activité est requise';
  if (!form.lastName.trim()) errors.lastName = 'Le nom est requis';
  if (!form.firstName.trim()) errors.firstName = 'Le prénom est requis';

  const phoneDigits = (form.phone.match(/\d/g) || []).length;
  if (!form.phone.trim()) errors.phone = 'Le téléphone est requis';
  else if (phoneDigits < MIN_PHONE_DIGITS) errors.phone = `Au moins ${MIN_PHONE_DIGITS} chiffres`;

  if (form.address.trim().length > MAX_ADDRESS_LENGTH) {
    errors.address = `Adresse trop longue (${MAX_ADDRESS_LENGTH} caractères maximum)`;
  }

  if (!form.registrationDate) errors.registrationDate = 'La date est requise';
  else if (!isValidIsoDate(form.registrationDate)) errors.registrationDate = 'Date invalide';

  if (!form.amount.trim()) {
    errors.amount = 'Le montant est requis (0 pour une inscription gratuite)';
  } else {
    const amount = parseAmountXof(form.amount);
    if (amount === null) errors.amount = 'Montant entier en F CFA, sans décimales';
    else if (amount > MAX_AMOUNT_XOF) errors.amount = 'Montant trop élevé';
  }

  return errors;
};

/** Premier champ en erreur dans l'ordre de l'écran, ou undefined. */
export const firstInvalidField = (errors: RegistrationFormErrors): RegistrationFormField | undefined =>
  FIELD_ORDER.find(field => errors[field]);

/** Construit l'inscription à enregistrer ; à n'appeler qu'après validation. Adresse vide = chaîne vide (D19). */
export const buildRegistrationPayload = (
  form: RegistrationFormState
): Omit<Registration, 'id' | 'createdAt'> => ({
  firstName: form.firstName.trim(),
  lastName: form.lastName.trim(),
  phone: form.phone.trim(),
  address: form.address.trim(),
  registrationDate: form.registrationDate,
  paymentType: form.paymentType,
  amount: parseAmountXof(form.amount) ?? 0,
  activityId: form.activityId,
});

/** « DIOP Awa » : nom en capitales pour la lecture rapide, données stockées telles que saisies. */
export const displayName = (r: Pick<Registration, 'lastName' | 'firstName'>): string =>
  `${r.lastName.toLocaleUpperCase('fr-FR')} ${r.firstName}`.trim();

/** Message du doublon (U9) : l'inscription existante avec sa date, son montant et son mode. */
export const duplicateMessage = (existing: Registration, activityName?: string): string =>
  `${displayName(existing)} (${existing.phone}) est déjà inscrit(e) à ${activityName ?? 'cette activité'} ` +
  `le ${formatIsoDate(existing.registrationDate)} pour ${formatAmount(existing.amount)} ` +
  `(${paymentLabel(existing.paymentType)}). Créer une seconde inscription ?`;

/** Props d'accessibilité d'un champ selon son erreur (m1). */
export const fieldA11y = (field: RegistrationFormField, errors: RegistrationFormErrors) => ({
  'aria-invalid': errors[field] ? true : undefined,
  'aria-describedby': errors[field] ? `${field}-error` : undefined,
});
