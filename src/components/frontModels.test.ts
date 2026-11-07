import { describe, expect, it } from 'vitest';
import {
  buildRegistrationPayload,
  fieldA11y,
  RegistrationFormState,
  validateRegistrationForm,
} from './registrationFormModel';
import { applySuggestion, formatIsoDate, hasSuggestion, REASON_LABEL } from './importReviewModel';
import type { SuspiciousRegistration } from '../utils/importReview';

const form = (overrides: Partial<RegistrationFormState> = {}): RegistrationFormState => ({
  firstName: ' Awa ',
  lastName: ' Diop ',
  phone: ' 77 123 45 67 ',
  address: ' Médina ',
  registrationDate: '2026-05-15',
  paymentType: 'wave',
  amount: '5 000',
  activityId: 'act-1',
  ...overrides,
});

describe('validateRegistrationForm (M10, QA-17, D1)', () => {
  it('formulaire complet : aucune erreur', () => {
    expect(validateRegistrationForm(form())).toEqual({});
  });

  it('accepte 0 F (activité gratuite)', () => {
    expect(validateRegistrationForm(form({ amount: '0' }))).toEqual({});
  });

  it.each(['1500,5', '1500.5', '5000abc', '5e3', '-5', '5,000'])('refuse le montant « %s »', (amount) => {
    expect(validateRegistrationForm(form({ amount })).amount).toBe('Montant entier en F CFA, sans décimales');
  });

  it('montant vide : message qui rappelle la gratuité', () => {
    expect(validateRegistrationForm(form({ amount: '  ' })).amount).toMatch(/0 pour une inscription gratuite/);
  });

  it('montant au-delà du plafond refusé', () => {
    expect(validateRegistrationForm(form({ amount: '100000001' })).amount).toBeDefined();
  });

  it('champs requis, téléphone trop court, date impossible', () => {
    const errors = validateRegistrationForm(
      form({ firstName: ' ', lastName: '', phone: '77 12', address: '', registrationDate: '2026-02-30', activityId: '' })
    );
    expect(Object.keys(errors).sort()).toEqual(
      ['activityId', 'address', 'firstName', 'lastName', 'phone', 'registrationDate'].sort()
    );
    expect(errors.phone).toMatch(/8 chiffres/);
    expect(errors.registrationDate).toBe('Date invalide');
    expect(validateRegistrationForm(form({ phone: '' })).phone).toMatch(/requis/);
    expect(validateRegistrationForm(form({ registrationDate: '' })).registrationDate).toMatch(/requise/);
  });

  it('buildRegistrationPayload nettoie les espaces et convertit le montant en entier', () => {
    expect(buildRegistrationPayload(form())).toEqual({
      firstName: 'Awa', lastName: 'Diop', phone: '77 123 45 67', address: 'Médina',
      registrationDate: '2026-05-15', paymentType: 'wave', amount: 5000, activityId: 'act-1',
    });
  });

  it('fieldA11y relie le champ en erreur à son message', () => {
    expect(fieldA11y('amount', { amount: 'x' })).toEqual({ 'aria-invalid': true, 'aria-describedby': 'amount-error' });
    expect(fieldA11y('amount', {})).toEqual({ 'aria-invalid': undefined, 'aria-describedby': undefined });
  });
});

describe('importReviewModel', () => {
  const suspicious = (overrides: Partial<SuspiciousRegistration> = {}): SuspiciousRegistration => ({
    registration: {
      id: 'r1', firstName: 'A', lastName: 'B', phone: '1', address: 'x', registrationDate: '2026-03-04',
      paymentType: 'cash', amount: 5, activityId: 'gala', createdAt: 42,
    },
    reasons: ['amount_too_small', 'date_ambiguous'],
    suggestedAmount: 5000,
    suggestedDate: '2026-04-03',
    batchSize: 3,
    ...overrides,
  });

  it('a un libellé pour chaque raison', () => {
    expect(Object.keys(REASON_LABEL).sort()).toEqual(['amount_too_small', 'date_ambiguous', 'non_integer']);
  });

  it('formatIsoDate sans décalage de fuseau', () => {
    expect(formatIsoDate('2026-03-04')).toBe('04/03/2026');
    expect(formatIsoDate('n/a')).toBe('n/a');
  });

  it('hasSuggestion : vrai seulement si une valeur change', () => {
    expect(hasSuggestion(suspicious())).toBe(true);
    expect(hasSuggestion(suspicious({ suggestedAmount: undefined, suggestedDate: undefined, reasons: ['non_integer'] }))).toBe(false);
    expect(hasSuggestion(suspicious({ suggestedAmount: 5, suggestedDate: '2026-03-04' }))).toBe(false);
  });

  it('applySuggestion renvoie une copie corrigée sans createdAt et ne modifie pas l’original', () => {
    const s = suspicious();
    const fixed = applySuggestion(s);
    expect(fixed).toMatchObject({ id: 'r1', amount: 5000, registrationDate: '2026-04-03' });
    expect('createdAt' in fixed).toBe(false);
    expect(s.registration.amount).toBe(5);
    expect(applySuggestion(suspicious({ suggestedAmount: undefined, suggestedDate: undefined }))).toMatchObject({ amount: 5, registrationDate: '2026-03-04' });
  });
});
