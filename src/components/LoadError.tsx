import React from 'react';
import { CircleExclamationPoint, RefreshCw } from 'lucide-react';

interface LoadErrorProps {
  message?: string;
  onRetry: () => void;
  isRetrying?: boolean;
  className?: string;
}

/** Panneau d'erreur de chargement (M3) : jamais confondu avec un état vide. */
const LoadError: React.FC<LoadErrorProps> = ({
  message = 'Impossible de charger les données.',
  onRetry,
  isRetrying = false,
  className = 'p-6',
}) => (
  <div className={className}>
    <div role="alert" className="panel p-8 text-center max-w-md mx-auto">
      <CircleExclamationPoint className="h-10 w-10 text-red-600 mx-auto mb-3" aria-hidden="true" />
      <p className="text-sm font-semibold text-gray-800 mb-1">{message}</p>
      <p className="text-xs text-gray-600 mb-4">
        Vos données enregistrées ne sont pas affectées. Réessayez ; si le problème persiste,
        redémarrez l'application.
      </p>
      <button
        type="button"
        onClick={onRetry}
        disabled={isRetrying}
        className="btn btn-primary disabled:opacity-50 disabled:pointer-events-none"
      >
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
        {isRetrying ? 'Chargement...' : 'Réessayer'}
      </button>
    </div>
  </div>
);

export default LoadError;
