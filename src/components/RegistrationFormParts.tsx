import React from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Registration } from '../types';
import { RegistrationFormErrors, displayName, fieldA11y } from './registrationFormModel';
import { formatIsoDate } from './importReviewModel';
import { formatAmount } from './uiFormat';
import { paymentLabel } from './paymentMeta';

export const LABEL_CLASS = 'block text-sm font-semibold text-ink-soft mb-1';

/** Astérisque des champs requis (le caractère requis est aussi porté par le message d'erreur). */
export const RequiredMark: React.FC = () => (
  <span className="text-danger" aria-hidden="true"> *</span>
);

export const FieldError: React.FC<{ id: string; message?: string }> = ({ id, message }) =>
  message ? (
    <p id={id} className="mt-1 flex items-start gap-1 text-sm text-danger">
      <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
      {message}
    </p>
  ) : null;

interface AmountFieldProps {
  value: string;
  errors: RegistrationFormErrors;
  onChange: (value: string) => void;
  onBlur: () => void;
}

/** Montant en texte (U7) : pas de molette ni de flèches, séparateur de milliers à la sortie du champ. */
export const AmountField: React.FC<AmountFieldProps> = ({ value, errors, onChange, onBlur }) => (
  <div className="w-52">
    <label htmlFor="amount" className={LABEL_CLASS}>
      Montant<span className="sr-only"> en francs CFA</span>
      <RequiredMark />
    </label>
    <div className="relative">
      <input
        type="text"
        inputMode="numeric"
        id="amount"
        name="amount"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        placeholder="0"
        className={`input-field input-lg text-right pr-16 tabular-nums ${errors.amount ? 'has-error' : ''}`}
        {...fieldA11y('amount', errors)}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted" aria-hidden="true">
        F CFA
      </span>
    </div>
    <FieldError id="amount-error" message={errors.amount} />
  </div>
);

interface DateFieldProps {
  value: string;
  today: string;
  isOpen: boolean;
  /** En modification, le champ est toujours visible et sans avertissement. */
  isEditMode: boolean;
  error?: string;
  onOpen: () => void;
  onChange: (value: string) => void;
}

/**
 * Date d'inscription hors de l'ordre de tabulation (U4) : « aujourd'hui » par défaut,
 * « Changer la date » révèle le champ et lui donne le focus.
 */
export const DateField: React.FC<DateFieldProps> = ({ value, today, isOpen, isEditMode, error, onOpen, onChange }) => {
  const isToday = value === today;
  if (!isOpen && !isEditMode && isToday && !error) {
    return (
      <p className="text-sm text-ink-muted">
        Date d'inscription : <b className="font-semibold text-ink">aujourd'hui, {formatIsoDate(today)}</b>
        {' · '}
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center min-h-[24px] px-0.5 font-semibold text-brand-700 underline hover:text-brand-900 rounded-control"
        >
          Changer la date
        </button>
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
      <div className="w-52">
        <label htmlFor="registrationDate" className={LABEL_CLASS}>
          Date d'inscription
          <RequiredMark />
        </label>
        <input
          type="date"
          id="registrationDate"
          name="registrationDate"
          value={value}
          autoFocus={isOpen}
          onChange={(e) => onChange(e.target.value)}
          className={`input-field input-lg ${error ? 'has-error' : ''}`}
          {...fieldA11y('registrationDate', { registrationDate: error })}
        />
      </div>
      {!isEditMode && !isToday && value && !error && (
        <p className="flex items-center gap-1 pb-3 text-sm font-semibold text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Date : {formatIsoDate(value)}, différente d'aujourd'hui
        </p>
      )}
      <div className="basis-full">
        <FieldError id="registrationDate-error" message={error} />
      </div>
    </div>
  );
};

interface SavedBannerProps {
  saved: Registration | null;
}

/**
 * Confirmation après enregistrement (Lot 1, 1.2). La zone `role="status"` existe toujours
 * pour que le lecteur d'écran annonce chaque nouveau contenu.
 */
export const SavedBanner: React.FC<SavedBannerProps> = ({ saved }) => (
  <div role="status" className={saved ? 'mx-4 mt-4' : 'sr-only'}>
    {saved && (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 rounded-control border border-success-line bg-success-soft text-sm text-success">
        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>
          Inscription enregistrée : <b>{displayName(saved)}</b> ·{' '}
          <b className="tabular-nums">{formatAmount(saved.amount)}</b> · {paymentLabel(saved.paymentType)}.
        </span>
        {saved.id && (
          <Link
            to={`/edit/${encodeURIComponent(saved.id)}?retour=saisie`}
            className="ml-auto inline-flex items-center min-h-[24px] px-1 font-semibold text-brand-700 underline hover:text-brand-900 rounded-control"
          >
            Modifier<span className="sr-only"> l'inscription de {displayName(saved)}</span>
          </Link>
        )}
      </div>
    )}
  </div>
);

export const RegistrationFormSkeleton: React.FC = () => (
  <div className="px-6 py-5 max-w-[45rem]" aria-busy="true">
    <div className="panel p-4 space-y-4">
      <div className="skeleton h-10 w-72 rounded" />
      <div className="grid grid-cols-2 gap-4">
        <div className="skeleton h-11 rounded" />
        <div className="skeleton h-11 rounded" />
        <div className="skeleton h-11 rounded" />
        <div className="skeleton h-11 rounded" />
      </div>
      <div className="skeleton h-11 w-2/3 rounded" />
    </div>
    <span className="sr-only">Chargement de l'inscription...</span>
  </div>
);

export const RegistrationNotFound: React.FC<{ onBack: () => void }> = ({ onBack }) => (
  <div className="p-6">
    <div className="panel p-8 text-center max-w-md mx-auto">
      <AlertCircle className="h-10 w-10 text-red-600 mx-auto mb-3" aria-hidden="true" />
      <h2 className="text-base font-semibold text-gray-800 mb-1">Inscription introuvable</h2>
      <p className="text-sm text-gray-600 mb-4">L'inscription demandée n'existe pas ou a été supprimée.</p>
      <button onClick={onBack} className="btn btn-primary">
        Retour à la liste
      </button>
    </div>
  </div>
);
