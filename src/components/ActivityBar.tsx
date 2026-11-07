import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Activity, DEFAULT_ACTIVITY_ID } from '../types';
import { isPastActivity } from './currentActivity';
import { FieldError } from './RegistrationFormParts';
import { formatAmount, formatDateLong } from './uiFormat';

const optionLabel = (a: Activity): string =>
  `${a.name}${a.eventDate ? ` · ${formatDateLong(a.eventDate)}` : ''}${a.archivedAt ? ' (archivée)' : ''}`;

interface ActivityBarProps {
  value: string;
  activities: Activity[];
  isLoading: boolean;
  hasLoadError: boolean;
  error?: string;
  onChange: (activityId: string) => void;
  onRetry: () => void;
}

/** Barre « Inscription pour [activité] · Montant habituel » en tête du formulaire (Lot 1, 1.1). */
const ActivityBar: React.FC<ActivityBarProps> = ({
  value, activities, isLoading, hasLoadError, error, onChange, onRetry,
}) => {
  const selected = activities.find(a => a.id === value);
  const hasOnlyDefault = !isLoading && activities.every(a => a.id === DEFAULT_ACTIVITY_ID);

  return (
    <div className="px-4 py-3 short:py-2 border-b border-gray-200 bg-surface-subtle rounded-t-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label htmlFor="activityId" className="text-sm font-semibold text-ink-soft">
          Inscription pour
        </label>
        <span
          className="h-3 w-3 rounded-full shrink-0 border border-gray-500"
          style={{ backgroundColor: selected?.color ?? '#9CA3AF' }}
          aria-hidden="true"
        />
        <select
          id="activityId"
          name="activityId"
          value={isLoading ? '' : value}
          onChange={(e) => onChange(e.target.value)}
          disabled={isLoading || hasLoadError}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'activityId-error' : undefined}
          className={`input-field h-10 w-auto max-w-[22rem] font-semibold text-ink ${error ? 'has-error' : ''}`}
        >
          {isLoading ? (
            <option value="">Chargement des activités...</option>
          ) : (
            activities.map(a => (
              <option key={a.id} value={a.id}>{optionLabel(a)}</option>
            ))
          )}
        </select>
        {selected && isPastActivity(selected) && !selected.archivedAt && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-warning-line bg-warning-soft text-xs font-semibold text-warning">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            Événement passé
          </span>
        )}
        {selected?.defaultAmount !== undefined && (
          <span className="text-sm text-ink-muted">
            Montant habituel : <b className="font-semibold text-ink tabular-nums">{formatAmount(selected.defaultAmount)}</b>
          </span>
        )}
        {hasOnlyDefault && !hasLoadError && (
          <Link to="/activities" className="inline-flex items-center min-h-[24px] text-sm font-semibold text-brand-700 underline">
            Créer une activité
          </Link>
        )}
      </div>
      <FieldError id="activityId-error" message={error} />
      {hasLoadError && (
        <p role="alert" className="mt-2 flex items-center gap-2 text-sm text-danger">
          Impossible de charger les activités.
          <button type="button" onClick={onRetry} className="btn btn-default">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Réessayer
          </button>
        </p>
      )}
    </div>
  );
};

export default ActivityBar;
