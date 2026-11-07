import React, { useCallback, useEffect, useState } from 'react';
import { Archive, RefreshCw } from 'lucide-react';
import { listAutoBackups } from '../utils/dbBackup';
import { DEMO_MODE } from '../utils/demo';
import { errorMessage, formatBytes } from './uiFormat';

interface AutoBackup {
  name: string;
  createdAt: number;
  sizeBytes: number;
}

type LoadState = 'loading' | 'error' | 'ready';

const formatDateTime = (ts: number): string =>
  new Date(ts).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/** Liste en lecture seule des sauvegardes automatiques (avant restauration / effacement). */
const AutoBackupsSection: React.FC = () => {
  const [state, setState] = useState<LoadState>('loading');
  const [backups, setBackups] = useState<AutoBackup[]>([]);
  const [error, setError] = useState<string>('');

  const load = useCallback(async () => {
    setState('loading');
    try {
      const list = await listAutoBackups();
      setBackups([...list].sort((a, b) => b.createdAt - a.createdAt));
      setState('ready');
    } catch (err) {
      setError(errorMessage(err, 'Impossible de lire les sauvegardes automatiques.'));
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (!DEMO_MODE) void load();
  }, [load]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <Archive className="h-3.5 w-3.5 text-gray-600" aria-hidden="true" />
        <h5 className="text-sm font-semibold text-ink-soft">Sauvegardes automatiques</h5>
      </div>
      <p className="text-xs text-gray-600 mb-2">
        Une copie de la base est faite à chaque démarrage, avant chaque mise à jour, avant chaque
        restauration et avant chaque effacement complet. Les 10 plus récentes de chaque type sont gardées.
      </p>

      {DEMO_MODE && <p className="text-xs text-gray-600">Indisponible en mode démonstration.</p>}

      {!DEMO_MODE && state === 'loading' && (
        <p className="text-xs text-gray-600" aria-busy="true">Chargement...</p>
      )}

      {!DEMO_MODE && state === 'error' && (
        <div role="alert" className="text-xs text-red-700 flex items-center gap-2">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="btn btn-default">
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            Réessayer
          </button>
        </div>
      )}

      {!DEMO_MODE && state === 'ready' && backups.length === 0 && (
        <p className="text-xs text-gray-600">Aucune sauvegarde automatique pour le moment.</p>
      )}

      {!DEMO_MODE && state === 'ready' && backups.length > 0 && (
        <ul className="panel bg-gray-50 divide-y divide-gray-200 max-h-36 overflow-auto">
          {backups.map(b => (
            <li key={b.name} className="px-3 py-1.5 text-xs flex items-center justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate text-gray-800" title={b.name}>{b.name}</span>
                <span className="text-gray-600 tabular-nums">{formatDateTime(b.createdAt)}</span>
              </span>
              <span className="text-gray-600 tabular-nums shrink-0">{formatBytes(b.sizeBytes)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default AutoBackupsSection;
