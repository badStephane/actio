import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Activity, Registration } from '../types';
import { PAYMENT_LABEL } from './uiFormat';
import { RegistrationFormErrors, fieldA11y } from './registrationFormModel';

export const FieldError: React.FC<{ id: string; message?: string }> = ({ id, message }) =>
  message ? (
    <p id={id} className="mt-0.5 text-xs text-red-700">
      {message}
    </p>
  ) : null;

const PAYMENT_ORDER: Registration['paymentType'][] = ['cash', 'wave', 'orange_money'];

interface PaymentFieldsetProps {
  value: Registration['paymentType'];
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/** Choix du mode de paiement, groupé pour les lecteurs d'écran (m1). */
export const PaymentFieldset: React.FC<PaymentFieldsetProps> = ({ value, onChange }) => (
  <fieldset>
    <legend className="block text-xs font-medium text-gray-700 mb-2">
      Type de paiement <span className="text-red-600" aria-hidden="true">*</span>
    </legend>
    <div className="flex gap-4">
      {PAYMENT_ORDER.map(type => (
        <label key={type} className="flex items-center gap-1.5 cursor-pointer min-h-[32px]">
          <input
            type="radio"
            name="paymentType"
            value={type}
            checked={value === type}
            onChange={onChange}
            className="h-3.5 w-3.5 text-blue-600 border-gray-300"
          />
          <span className="text-sm text-gray-700">{PAYMENT_LABEL[type]}</span>
        </label>
      ))}
    </div>
  </fieldset>
);

export const RegistrationFormSkeleton: React.FC = () => (
  <div className="p-6 max-w-2xl" aria-busy="true">
    <div className="panel p-4 space-y-4">
      <div className="skeleton h-8 w-48 rounded" />
      <div className="grid grid-cols-2 gap-3">
        <div className="skeleton h-9 rounded" />
        <div className="skeleton h-9 rounded" />
      </div>
      <div className="skeleton h-9 rounded" />
      <div className="skeleton h-16 rounded" />
      <div className="grid grid-cols-2 gap-3">
        <div className="skeleton h-9 rounded" />
        <div className="skeleton h-9 rounded" />
      </div>
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

interface ActivityFieldProps {
  value: string;
  activities: Activity[];
  error?: string;
  hasLoadError: boolean;
  onChange: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  onRetry: () => void;
}

/** Choix de l'activité, avec erreur de chargement distincte d'une liste vide (M3). */
export const ActivityField: React.FC<ActivityFieldProps> = ({
  value, activities, error, hasLoadError, onChange, onRetry,
}) => (
  <div>
    <label htmlFor="activityId" className="block text-xs font-medium text-gray-700 mb-1">
      Activité <span className="text-red-600" aria-hidden="true">*</span>
    </label>
    <select
      id="activityId"
      name="activityId"
      value={value}
      onChange={onChange}
      disabled={hasLoadError}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? 'activityId-error' : undefined}
      className={`input-field ${error ? 'has-error' : ''}`}
    >
      {activities.map(a => (
        <option key={a.id} value={a.id}>
          {a.name}
          {a.eventDate ? ` · ${new Date(a.eventDate).toLocaleDateString('fr-FR')}` : ''}
          {a.archivedAt ? ' (archivée)' : ''}
        </option>
      ))}
    </select>
    <FieldError id="activityId-error" message={error} />
    {hasLoadError && (
      <p role="alert" className="mt-1 text-xs text-red-700 flex items-center gap-2">
        Impossible de charger les activités.
        <button type="button" onClick={onRetry} className="btn btn-default py-0.5">
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          Réessayer
        </button>
      </p>
    )}
  </div>
);

interface DateAmountFieldsProps {
  registrationDate: string;
  amount: string;
  errors: RegistrationFormErrors;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

/** Date d'inscription et montant entier en F CFA (D1, D10). */
export const DateAmountFields: React.FC<DateAmountFieldsProps> = ({ registrationDate, amount, errors, onChange }) => (
  <div className="grid grid-cols-2 gap-3">
    <div>
      <label htmlFor="registrationDate" className="block text-xs font-medium text-gray-700 mb-1">
        Date d'inscription <span className="text-red-600" aria-hidden="true">*</span>
      </label>
      <input
        type="date"
        id="registrationDate"
        name="registrationDate"
        value={registrationDate}
        onChange={onChange}
        className={`input-field ${errors.registrationDate ? 'has-error' : ''}`}
        {...fieldA11y('registrationDate', errors)}
      />
      <FieldError id="registrationDate-error" message={errors.registrationDate} />
    </div>
    <div>
      <label htmlFor="amount" className="block text-xs font-medium text-gray-700 mb-1">
        Montant (F CFA) <span className="text-red-600" aria-hidden="true">*</span>
      </label>
      <input
        type="number"
        id="amount"
        name="amount"
        value={amount}
        onChange={onChange}
        min="0"
        step="1"
        inputMode="numeric"
        placeholder="0"
        className={`input-field ${errors.amount ? 'has-error' : ''}`}
        {...fieldA11y('amount', errors)}
      />
      <FieldError id="amount-error" message={errors.amount} />
    </div>
  </div>
);
