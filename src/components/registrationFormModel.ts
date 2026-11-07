import { Registration } from '../types';
import { parseAmountXof, MAX_AMOUNT_XOF } from '../utils/amount';
import { isValidIsoDate } from '../utils/dates';

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

/** Validation pure du formulaire d'inscription (D1 : montant entier >= 0). */
export const validateRegistrationForm = (form: RegistrationFormState): RegistrationFormErrors => {
  const errors: RegistrationFormErrors = {};

  if (!form.activityId) errors.activityId = 'L\'activité est requise';
  if (!form.lastName.trim()) errors.lastName = 'Le nom est requis';
  if (!form.firstName.trim()) errors.firstName = 'Le prénom est requis';

  const phoneDigits = (form.phone.match(/\d/g) || []).length;
  if (!form.phone.trim()) errors.phone = 'Le téléphone est requis';
  else if (phoneDigits < MIN_PHONE_DIGITS) errors.phone = `Au moins ${MIN_PHONE_DIGITS} chiffres`;

  if (!form.address.trim()) errors.address = 'L\'adresse est requise';

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

/** Construit l'inscription à enregistrer ; à n'appeler qu'après validation. */
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

/** Props d'accessibilité d'un champ selon son erreur (m1). */
export const fieldA11y = (field: RegistrationFormField, errors: RegistrationFormErrors) => ({
  'aria-invalid': errors[field] ? true : undefined,
  'aria-describedby': errors[field] ? `${field}-error` : undefined,
});
