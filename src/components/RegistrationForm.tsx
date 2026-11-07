import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, Eraser, List, Save, X } from 'lucide-react';
import { addRegistration, getRegistrationById, updateRegistration, findDuplicateRegistration } from '../utils/storage';
import { getActivities } from '../utils/activities';
import { todayLocalIso } from '../utils/dates';
import { Activity, Registration } from '../types';
import { Contact } from '../utils/contacts';
import ConfirmModal from './ConfirmModal';
import LoadError from './LoadError';
import Toast from './Toast';
import ActivityBar from './ActivityBar';
import IdentityFields from './IdentityFields';
import PaymentSegment from './PaymentSegment';
import SessionPanel from './SessionPanel';
import { AmountField, DateField, RegistrationFormSkeleton, RegistrationNotFound, SavedBanner } from './RegistrationFormParts';
import {
  RegistrationFormState,
  RegistrationFormErrors,
  RegistrationFormField,
  buildRegistrationPayload,
  createEmptyForm,
  defaultAmountOf,
  duplicateMessage,
  firstInvalidField,
  formatAmountInput,
  resetFormAfterSave,
  validateRegistrationForm,
} from './registrationFormModel';
import { errorMessage } from './uiFormat';
import { PaymentType, paymentRadioId } from './paymentMeta';
import { readCurrentActivityId, resolveGuichetActivity, writeCurrentActivityId } from './currentActivity';
import { entriesForActivity, toSessionEntry } from './sessionEntries';
import { useSessionEntries } from './useSessionEntries';
import { useEntryTiming } from './useEntryTiming';
import { useFlashToast } from './useFlashToast';
import { useToast } from './useToast';
import { FOCUS_LAST_NAME_EVENT } from './shortcuts';

type LoadState = 'loading' | 'ready' | 'error';

const omitKeys = (errors: RegistrationFormErrors, keys: RegistrationFormField[]): RegistrationFormErrors =>
  Object.fromEntries(Object.entries(errors).filter(([k]) => !keys.includes(k as RegistrationFormField)));

/** Focus après le rendu (le champ date n'existe qu'une fois révélé). */
const focusSoon = (elementId: string): void => {
  requestAnimationFrame(() => document.getElementById(elementId)?.focus());
};

const elementIdOf = (field: RegistrationFormField, paymentType: PaymentType): string =>
  field === 'paymentType' ? paymentRadioId(paymentType) : field;

const listHrefOf = (activityId: string): string =>
  activityId ? `/registrations?activity=${encodeURIComponent(activityId)}` : '/registrations';

const RegistrationForm: React.FC = () => {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const presetActivityId = searchParams.get('activity');
  const returnsToEntry = searchParams.get('retour') === 'saisie';
  const isEditMode = Boolean(editId);

  const [formData, setFormData] = useState<RegistrationFormState>(() => createEmptyForm(null));
  const [errors, setErrors] = useState<RegistrationFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isLoadingExisting, setIsLoadingExisting] = useState(isEditMode);
  const [existingLoadError, setExistingLoadError] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activitiesState, setActivitiesState] = useState<LoadState>('loading');
  const [duplicate, setDuplicate] = useState<Registration | null>(null);
  const [lastSaved, setLastSaved] = useState<Registration | null>(null);
  const [contactNote, setContactNote] = useState<string | null>(null);
  const [isDateOpen, setIsDateOpen] = useState(false);
  const submittingRef = useRef(false);
  const { entries, addEntry } = useSessionEntries();
  const timing = useEntryTiming();
  const { toast, showToast, closeToast } = useToast();
  useFlashToast(showToast);

  const activitiesById = useMemo(() => new Map(activities.map(a => [a.id, a])), [activities]);
  const today = todayLocalIso();

  const loadActivities = useCallback(async () => {
    setActivitiesState('loading');
    try {
      const list = await getActivities(true);
      setActivities(list);
      setActivitiesState('ready');
      if (isEditMode) return;
      const picked = resolveGuichetActivity(list, presetActivityId, readCurrentActivityId());
      if (!picked) return;
      writeCurrentActivityId(picked.id);
      setFormData(prev => ({
        ...prev,
        activityId: picked.id,
        amount: prev.amount === '' ? defaultAmountOf(picked) : prev.amount,
      }));
    } catch {
      setActivitiesState('error');
    }
  }, [isEditMode, presetActivityId]);

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
          amount: formatAmountInput(String(existing.amount)),
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

  useEffect(() => {
    if (isEditMode) return;
    const focusLastName = () => document.getElementById('lastName')?.focus();
    window.addEventListener(FOCUS_LAST_NAME_EVENT, focusLastName);
    return () => window.removeEventListener(FOCUS_LAST_NAME_EVENT, focusLastName);
  }, [isEditMode]);

  const clearErrors = (keys: RegistrationFormField[]) => {
    setErrors(prev => (keys.some(k => prev[k]) ? omitKeys(prev, keys) : prev));
  };

  const setFieldValue = (name: RegistrationFormField, value: string) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    clearErrors([name]);
    if (!isEditMode) timing.markInput();
  };

  const handleContactFieldChange = (name: 'lastName' | 'firstName' | 'phone', value: string) => {
    setFieldValue(name, value);
    setContactNote(null);
  };

  const fillFromContact = (contact: Contact) => {
    setFormData(prev => ({
      ...prev,
      lastName: contact.lastName,
      firstName: contact.firstName,
      phone: contact.phone,
      address: contact.address || prev.address,
    }));
    clearErrors(['lastName', 'firstName', 'phone', 'address']);
    setContactNote(`Coordonnées reprises du carnet : ${contact.phone}`);
    focusSoon(paymentRadioId(formData.paymentType));
  };

  const handleActivityChange = (activityId: string) => {
    setFormData(prev => {
      if (isEditMode) return { ...prev, activityId };
      const isAmountUntouched = prev.amount === '' || prev.amount === defaultAmountOf(activitiesById.get(prev.activityId));
      return {
        ...prev,
        activityId,
        amount: isAmountUntouched ? defaultAmountOf(activitiesById.get(activityId)) : prev.amount,
      };
    });
    if (!isEditMode) writeCurrentActivityId(activityId);
    clearErrors(['activityId', 'amount']);
  };

  const releaseSubmit = () => {
    submittingRef.current = false;
    setIsSubmitting(false);
  };

  const resetEntry = () => {
    setFormData(prev => resetFormAfterSave(prev, activitiesById.get(prev.activityId)));
    setErrors({});
    setContactNote(null);
    focusSoon('lastName');
  };

  const handleCreated = (saved: Registration) => {
    if (saved.id) addEntry(toSessionEntry(saved));
    timing.recordSaved();
    setLastSaved(saved);
    resetEntry();
    releaseSubmit();
  };

  const returnPath = returnsToEntry ? '/add' : listHrefOf(formData.activityId);

  const persist = async () => {
    const payload = buildRegistrationPayload(formData);
    try {
      if (isEditMode && editId) {
        await updateRegistration({ id: editId, ...payload });
        navigate(returnPath, { state: { flash: 'Inscription modifiée.' } });
        return;
      }
      const created = await addRegistration(payload);
      // Valeurs de repli si la couche données ne renvoie pas l'inscription complète.
      handleCreated({ ...payload, ...created, id: created?.id ?? '', createdAt: created?.createdAt ?? Date.now() });
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
    if (submittingRef.current || activitiesState !== 'ready') return;
    setSubmitError(null);
    const found = validateRegistrationForm(formData);
    setErrors(found);
    const firstInvalid = firstInvalidField(found);
    if (firstInvalid) {
      focusSoon(elementIdOf(firstInvalid, formData.paymentType));
      return;
    }

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

  const handleClearEntry = () => {
    timing.reset();
    setSubmitError(null);
    resetEntry();
  };

  if (isLoadingExisting) return <RegistrationFormSkeleton />;
  if (existingLoadError) {
    return <LoadError message="Impossible de charger cette inscription." onRetry={() => void loadExisting()} />;
  }
  if (notFound) return <RegistrationNotFound onBack={() => navigate('/registrations')} />;

  const selectableActivities = activities.filter(a => !a.archivedAt || a.id === formData.activityId);
  const currentActivity = activitiesById.get(formData.activityId);
  const isSubmitDisabled = isSubmitting || activitiesState !== 'ready';

  return (
    <div className="px-6 py-5">
      <div className="flex flex-col xl:flex-row xl:items-start gap-6">
        <form onSubmit={handleSubmit} className="panel rounded-card shadow-card w-full max-w-[45rem]" noValidate>
          <ActivityBar
            value={formData.activityId}
            activities={selectableActivities}
            isLoading={activitiesState === 'loading'}
            hasLoadError={activitiesState === 'error'}
            error={errors.activityId}
            onChange={handleActivityChange}
            onRetry={() => void loadActivities()}
          />

          <SavedBanner saved={isEditMode ? null : lastSaved} />

          <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <IdentityFields
              form={formData}
              errors={errors}
              isEditMode={isEditMode}
              contactNote={contactNote}
              onContactFieldChange={handleContactFieldChange}
              onAddressChange={(value) => setFieldValue('address', value)}
              onContactSelect={fillFromContact}
            />

            <div className="sm:col-span-2 flex flex-wrap items-start gap-4">
              <PaymentSegment
                value={formData.paymentType}
                onChange={(type) => setFormData(prev => ({ ...prev, paymentType: type }))}
              />
              <AmountField
                value={formData.amount}
                errors={errors}
                onChange={(value) => setFieldValue('amount', value)}
                onBlur={() => setFormData(prev => ({ ...prev, amount: formatAmountInput(prev.amount) }))}
              />
            </div>

            <div className="sm:col-span-2">
              <DateField
                value={formData.registrationDate}
                today={today}
                isOpen={isDateOpen}
                isEditMode={isEditMode}
                error={errors.registrationDate}
                onOpen={() => setIsDateOpen(true)}
                onChange={(value) => setFieldValue('registrationDate', value)}
              />
            </div>
          </div>

          {submitError && (
            <div role="alert" className="mx-4 mb-4 flex items-start gap-2 px-3 py-2 rounded-control border border-danger-line bg-danger-soft text-sm text-danger">
              <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span>{submitError}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-gray-200 bg-surface-subtle rounded-b-card">
            {isEditMode ? (
              <span />
            ) : (
              <button type="button" onClick={handleClearEntry} className="btn btn-ghost btn-lg">
                <Eraser className="h-4 w-4" aria-hidden="true" />
                Effacer la saisie
              </button>
            )}
            <div className="flex flex-wrap gap-2">
              {isEditMode ? (
                <button type="button" onClick={() => navigate(returnPath)} className="btn btn-default btn-lg">
                  <X className="h-4 w-4" aria-hidden="true" />
                  Annuler
                </button>
              ) : (
                <Link to={listHrefOf(formData.activityId)} className="btn btn-default btn-lg">
                  <List className="h-4 w-4" aria-hidden="true" />
                  Voir la liste
                </Link>
              )}
              <button
                type="submit"
                disabled={isSubmitDisabled}
                aria-busy={isSubmitting}
                aria-keyshortcuts="Enter"
                className="btn btn-brand btn-lg disabled:opacity-60 disabled:pointer-events-none"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {isSubmitting
                  ? isEditMode ? 'Mise à jour...' : 'Enregistrement...'
                  : isEditMode ? 'Mettre à jour' : 'Enregistrer'}
                <kbd className="kbd border-white/60 text-white" aria-hidden="true">Entrée</kbd>
              </button>
            </div>
          </div>
        </form>

        {!isEditMode && (
          <SessionPanel
            entries={entriesForActivity(entries, formData.activityId)}
            activityName={currentActivity?.name}
            listHref={listHrefOf(formData.activityId)}
            listLabel={currentActivity ? `Voir la liste de ${currentActivity.name}` : 'Voir la liste'}
          />
        )}
      </div>

      <ConfirmModal
        open={duplicate !== null}
        title="Inscription déjà existante"
        message={duplicate ? duplicateMessage(duplicate, activitiesById.get(duplicate.activityId)?.name) : ''}
        confirmLabel="Créer quand même"
        cancelLabel="Annuler"
        onConfirm={handleConfirmDuplicate}
        onCancel={handleCancelDuplicate}
      />

      <Toast open={toast.open} variant={toast.variant} message={toast.message} onClose={closeToast} />
    </div>
  );
};

export default RegistrationForm;
