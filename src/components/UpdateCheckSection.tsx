import React from 'react';
import { RefreshCw, CircleArrowDown } from 'lucide-react';
import { useUpdateCheck, UpdateCheckStatus } from './updateContext';

const STATUS_TEXT: Record<Exclude<UpdateCheckStatus, 'available'>, string> = {
  idle: '',
  checking: 'Recherche en cours...',
  'up-to-date': 'L\'application est à jour.',
  error: 'Vérification impossible (pas de connexion ?). Vous pouvez continuer à travailler normalement.',
};

/** Vérification manuelle des mises à jour (SRE m11). */
const UpdateCheckSection: React.FC = () => {
  const { status, availableVersion, checkNow } = useUpdateCheck();
  const isChecking = status === 'checking';
  const text =
    status === 'available'
      ? `Version ${availableVersion ?? ''} disponible : voir l'encadré en bas à droite.`
      : STATUS_TEXT[status];

  return (
    <div className="border-t border-gray-200 pt-4">
      <div className="flex items-center gap-2 mb-2">
        <CircleArrowDown className="h-3.5 w-3.5 text-gray-600" aria-hidden="true" />
        <h4 className="text-xs font-medium text-gray-700">Mises à jour</h4>
      </div>
      <button
        type="button"
        onClick={() => void checkNow()}
        disabled={isChecking}
        className="btn btn-default disabled:opacity-50 disabled:pointer-events-none"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${isChecking ? 'animate-spin' : ''}`} aria-hidden="true" />
        Rechercher une mise à jour
      </button>
      <p
        className={`mt-2 text-xs ${status === 'error' ? 'text-amber-800' : 'text-gray-600'}`}
        aria-live="polite"
      >
        {text}
      </p>
    </div>
  );
};

export default UpdateCheckSection;
