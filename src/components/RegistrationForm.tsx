import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { CheckCircle, AlertCircle, Save, X } from 'lucide-react';
import { addRegistration, getRegistrationById, updateRegistration, findDuplicateRegistration } from '../utils/storage';
import { getActivities } from '../utils/activities';
import { todayLocalIso } from '../utils/dates';
import { Activity, DEFAULT_ACTIVITY_ID, Registration } from '../types';
import { Contact } from '../utils/contacts';
import ConfirmModal from './ConfirmModal';
import ContactAutocomplete from './ContactAutocomplete';
import LoadError from './LoadError';
import {
  ActivityField,
  DateAmountFields,
  FieldError,
  PaymentFieldset,
  RegistrationFormSkeleton,
  RegistrationNotFound,
} from './RegistrationFormParts';
import {
  RegistrationFormState,
  RegistrationFormErrors,
  RegistrationFormField,
  validateRegistrationForm,
  buildRegistrationPayload,
  fieldA11y,
} from './registrationFormModel';
import { errorMessage } from './uiFormat';

const REDIRECT_DELAY_MS = 1200;
const CONTACT_FIELDS: RegistrationFormField[] = ['lastName', 'firstName', 'phone'];

const emptyForm = (activityId: string): RegistrationFormState => ({
  firstName: '',
  lastName: '',
  phone: '',
  address: '',
  registrationDate: todayLocalIso(),
  paymentType: 'cash',
  amount: '',
  activityId,
});

const omitKeys = (errors: RegistrationFormErrors, keys: RegistrationFormField[]): RegistrationFormErrors =>
  Object.fromEntries(Object.entries(errors).filter(([k]) => !keys.includes(k as RegistrationFormField)));

const RegistrationForm: React.FC = () => {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const presetActivityId = searchParams.get('activity');
  const isEditMode = Boolean(editId);

  const [formData, setFormData] = useState<RegistrationFormState>(() =>
    emptyForm(presetActivityId || DEFAULT_ACTIVITY_ID)
  );
  const [errors, setErrors] = useState<RegistrationFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isLoadingExisting, setIsLoadingExisting] = useState(isEditMode);
  const [existingLoadError, setExistingLoadError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesError, setActivitiesError] = useState(false);
  const [duplicate, setDuplicate] = useState<Registration | null>(null);
  const submittingRef = useRef(false);
  const redirectTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(redirectTimerRef.current), []);

  const loadActivities = useCallback(async () => {
    setActivitiesError(false);
    try {
      const list = await getActivities(true);
      setActivities(list);
      if (isEditMode) return;
      const live = list.filter(a => !a.archivedAt);
      setFormData(prev => {
        const picked = live.find(a => a.id === prev.activityId) ?? live[0];
        if (!picked) return prev;
        const shouldPrefill = prev.amount === '' && picked.defaultAmount !== undefined;
        return {
          ...prev,
          activityId: picked.id,
          amount: shouldPrefill ? String(picked.defaultAmount) : prev.amount,
        };
      });
    } catch {
      setActivitiesError(true);
    }
  }, [isEditMode]);

  const loadExisting = useCallback(async () => {
    if (!editId) return;
    setIsLoadingExisting(true);
    setExistingLoadError(false);
    try {
      const existing = await getRegistrationById(editId);
      if (!existing) {
        setNotFound(true);
      } else {
        setFormData({
          firstName: existing.firstName,
          lastName: existing.lastName,
          phone: existing.phone,
          address: existing.address,
          registrationDate: existing.registrationDate,
          paymentType: existing.paymentType,
          amount: String(existing.amount),
          activityId: existing.activityId,
        });
      }
    } catch {
      setExistingLoadError(true);
    } finally {
      setIsLoadingExisting(false);
    }
  }, [editId]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  useEffect(() => {
    void loadExisting();
  }, [loadExisting]);

  const clearErrors = (keys: RegistrationFormField[]) => {
    setErrors(prev => (keys.some(k => prev[k]) ? omitKeys(prev, keys) : prev));
  };

  const setFieldValue = (name: RegistrationFormField, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    clearErrors([name]);
  };

  const fillFromContact = (contact: Contact) => {
    setFormData(prev => ({
      ...prev,
      lastName: contact.lastName,
      firstName: contact.firstName,
      phone: contact.phone,
      address: contact.address || prev.address,
    }));
    clearErrors(contact.address ? [...CONTACT_FIELDS, 'address'] : CONTACT_FIELDS);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const name = e.target.name as RegistrationFormField;
    const { value } = e.target;
    setFormData(prev => {
      const next = { ...prev, [name]: value };
      if (name !== 'activityId' || isEditMode) return next;
      const picked = activities.find(a => a.id === value);
      const canPrefill = prev.amount === '' || prev.amount === '0';
      return picked?.defaultAmount !== undefined && canPrefill
        ? { ...next, amount: String(picked.defaultAmount) }
        : next;
    });
    clearErrors([name]);
  };

  const releaseSubmit = () => {
    submittingRef.current = false;
    setIsSubmitting(false);
  };

  const persist = async () => {
    try {
      const payload = buildRegistrationPayload(formData);
      if (isEditMode && editId) await updateRegistration({ id: editId, ...payload });
      else await addRegistration(payload);
      setIsSuccess(true);
      redirectTimerRef.current = window.setTimeout(() => navigate('/registrations'), REDIRECT_DELAY_MS);
    } catch (err) {
      const detail = errorMessage(err, '');
      setSubmitError(
        `L'inscription n'a pas pu être enregistrée. Vos informations sont conservées, réessayez.${detail ? ` (Détail : ${detail})` : ''}`
      );
      releaseSubmit();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // M2 : verrou posé avant toute attente, contre le double clic / double Entrée.
    if (submittingRef.current) return;
    setSubmitError(null);
    const found = validateRegistrationForm(formData);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const existing = await findDuplicateRegistration(
        formData.activityId,
        formData.lastName.trim(),
        formData.firstName.trim(),
        formData.phone.trim(),
        editId
      );
      if (existing) {
        setDuplicate(existing);
        return;
      }
    } catch {
      // La détection de doublon n'est qu'un avertissement (D9) : on enregistre quand même.
    }
    await persist();
  };

  const handleConfirmDuplicate = async () => {
    setDuplicate(null);
    await persist();
  };

  const handleCancelDuplicate = () => {
    setDuplicate(null);
    releaseSubmit();
  };

  if (isLoadingExisting) return <RegistrationFormSkeleton />;
  if (existingLoadError) {
    return <LoadError message="Impossible de charger cette inscription." onRetry={() => void loadExisting()} />;
  }
  if (notFound) return <RegistrationNotFound onBack={() => navigate('/registrations')} />;

  const selectableActivities = activities.filter(a => !a.archivedAt || a.id === formData.activityId);
  const inputClass = (field: RegistrationFormField, extra = '') =>
    `input-field ${extra} ${errors[field] ? 'has-error' : ''}`.trim();
  const contactInputProps = (field: 'lastName' | 'firstName' | 'phone', type: string, placeholder?: string) => ({
    type,
    id: field,
    name: field,
    placeholder,
    autoComplete: 'off',
    className: inputClass(field),
    ...fieldA11y(field, errors),
  });

  if (isSuccess) {
    return (
      <div className="p-6 max-w-2xl">
        <div className="panel p-8 text-center" role="status">
          <CheckCircle className="h-10 w-10 text-emerald-600 mx-auto mb-3" aria-hidden="true" />
          <p className="text-base font-medium text-emerald-800">
            {isEditMode ? 'Inscription modifiée !' : 'Inscription enregistrée !'}
          </p>
          <p className="text-xs text-gray-600 mt-1">Redirection...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl">
      <form onSubmit={handleSubmit} className="panel" noValidate>
        <div className="p-4 space-y-4">
          <ActivityField
            value={formData.activityId}
            activities={selectableActivities}
            error={errors.activityId}
            hasLoadError={activitiesError}
            onChange={handleChange}
            onRetry={() => void loadActivities()}
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="lastName" className="block text-xs font-medium text-gray-700 mb-1">
                Nom <span className="text-red-600" aria-hidden="true">*</span>
              </label>
              <ContactAutocomplete
                value={formData.lastName}
                onChange={(v) => setFieldValue('lastName', v)}
                onSelect={fillFromContact}
                enabled={!isEditMode}
                inputProps={contactInputProps('lastName', 'text')}
              />
              <FieldError id="lastName-error" message={errors.lastName} />
            </div>
            <div>
              <label htmlFor="firstName" className="block text-xs font-medium text-gray-700 mb-1">
                Prénoms <span className="text-red-600" aria-hidden="true">*</span>
              </label>
              <ContactAutocomplete
                value={formData.firstName}
                onChange={(v) => setFieldValue('firstName', v)}
                onSelect={fillFromContact}
                enabled={!isEditMode}
                inputProps={contactInputProps('firstName', 'text')}
              />
              <FieldError id="firstName-error" message={errors.firstName} />
            </div>
          </div>

          <div>
            <label htmlFor="phone" className="block text-xs font-medium text-gray-700 mb-1">
              Téléphone <span className="text-red-600" aria-hidden="true">*</span>
            </label>
            <ContactAutocomplete
              value={formData.phone}
              onChange={(v) => setFieldValue('phone', v)}
              onSelect={fillFromContact}
              enabled={!isEditMode}
              inputProps={{ ...contactInputProps('phone', 'tel', '07 07 07 07 07'), inputMode: 'tel' }}
            />
            <FieldError id="phone-error" message={errors.phone} />
          </div>

          <div>
            <label htmlFor="address" className="block text-xs font-medium text-gray-700 mb-1">
              Adresse <span className="text-red-600" aria-hidden="true">*</span>
            </label>
            <textarea
              id="address"
              name="address"
              value={formData.address}
              onChange={handleChange}
              rows={2}
              className={inputClass('address', 'resize-none')}
              {...fieldA11y('address', errors)}
            />
            <FieldError id="address-error" message={errors.address} />
          </div>

          <DateAmountFields
            registrationDate={formData.registrationDate}
            amount={formData.amount}
            errors={errors}
            onChange={handleChange}
          />

          <PaymentFieldset value={formData.paymentType} onChange={handleChange} />
        </div>

        {submitError && (
          <div role="alert" className="mx-4 mb-3 flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <span>{submitError}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b">
          <button type="button" onClick={() => navigate('/registrations')} className="btn btn-default">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Annuler
          </button>
          <button
            type="submit"
            disabled={isSubmitting || activitiesError}
            aria-busy={isSubmitting}
            className="btn btn-primary disabled:opacity-60 disabled:pointer-events-none"
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
            {isSubmitting
              ? isEditMode ? 'Mise à jour...' : 'Enregistrement...'
              : isEditMode ? 'Mettre à jour' : 'Enregistrer'}
          </button>
        </div>
      </form>

      <ConfirmModal
        open={duplicate !== null}
        title="Inscription déjà existante"
        message={
          duplicate
            ? `${duplicate.lastName} ${duplicate.firstName} (${duplicate.phone}) est déjà inscrit(e) à cette activité. Voulez-vous quand même créer une nouvelle inscription ?`
            : ''
        }
        confirmLabel="Créer quand même"
        cancelLabel="Annuler"
        variant="danger"
        onConfirm={handleConfirmDuplicate}
        onCancel={handleCancelDuplicate}
      />
    </div>
  );
};

export default RegistrationForm;
