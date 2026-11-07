import React from 'react';
import { Contact } from '../utils/contacts';
import ContactAutocomplete from './ContactAutocomplete';
import { FieldError, LABEL_CLASS, RequiredMark } from './RegistrationFormParts';
import {
  MAX_ADDRESS_LENGTH,
  RegistrationFormErrors,
  RegistrationFormState,
  fieldA11y,
} from './registrationFormModel';

type ContactField = 'lastName' | 'firstName' | 'phone';

interface IdentityFieldsProps {
  form: RegistrationFormState;
  errors: RegistrationFormErrors;
  isEditMode: boolean;
  /** Ligne « Coordonnées reprises du carnet » après le choix d'un contact (1.5). */
  contactNote: string | null;
  onContactFieldChange: (field: ContactField, value: string) => void;
  onAddressChange: (value: string) => void;
  onContactSelect: (contact: Contact) => void;
}

const describedBy = (...ids: (string | false | undefined)[]): string | undefined =>
  ids.filter(Boolean).join(' ') || undefined;

/** Nom | Prénoms ; Téléphone | Adresse (Lot 1, 1.4). Adresse facultative (D19). */
const IdentityFields: React.FC<IdentityFieldsProps> = ({
  form, errors, isEditMode, contactNote, onContactFieldChange, onAddressChange, onContactSelect,
}) => {
  const hasSuggestions = !isEditMode;
  const inputProps = (field: ContactField, type: string): React.InputHTMLAttributes<HTMLInputElement> => ({
    type,
    id: field,
    name: field,
    autoComplete: 'off',
    className: `input-field input-lg ${errors[field] ? 'has-error' : ''}`,
    ...fieldA11y(field, errors),
  });

  const contactField = (field: ContactField, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <ContactAutocomplete
      value={form[field]}
      onChange={(v) => onContactFieldChange(field, v)}
      onSelect={onContactSelect}
      enabled={hasSuggestions}
      inputProps={{ ...inputProps(field, field === 'phone' ? 'tel' : 'text'), ...extra }}
    />
  );

  return (
    <>
      <div>
        <label htmlFor="lastName" className={LABEL_CLASS}>Nom<RequiredMark /></label>
        {contactField('lastName', {
          autoFocus: !isEditMode,
          'aria-describedby': describedBy(errors.lastName && 'lastName-error', hasSuggestions && 'lastName-hint'),
        })}
        <FieldError id="lastName-error" message={errors.lastName} />
        {hasSuggestions && (
          <p id="lastName-hint" className="mt-1 text-xs text-ink-muted short:sr-only">
            Tapez 2 lettres ou des chiffres du téléphone pour retrouver un contact.
          </p>
        )}
        <p role="status" className={contactNote ? 'mt-1 text-sm font-semibold text-success' : 'sr-only'}>
          {contactNote}
        </p>
      </div>

      <div>
        <label htmlFor="firstName" className={LABEL_CLASS}>Prénoms<RequiredMark /></label>
        {contactField('firstName')}
        <FieldError id="firstName-error" message={errors.firstName} />
      </div>

      <div>
        <label htmlFor="phone" className={LABEL_CLASS}>Téléphone<RequiredMark /></label>
        {contactField('phone', { inputMode: 'tel', placeholder: '77 123 45 67' })}
        <FieldError id="phone-error" message={errors.phone} />
      </div>

      <div>
        <label htmlFor="address" className={LABEL_CLASS}>
          Adresse <span className="font-normal text-ink-muted">(facultatif)</span>
        </label>
        <input
          type="text"
          id="address"
          name="address"
          autoComplete="off"
          maxLength={MAX_ADDRESS_LENGTH}
          value={form.address}
          onChange={(e) => onAddressChange(e.target.value)}
          className={`input-field input-lg ${errors.address ? 'has-error' : ''}`}
          {...fieldA11y('address', errors)}
        />
        <FieldError id="address-error" message={errors.address} />
      </div>
    </>
  );
};

export default IdentityFields;
