import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, AlertCircle, X, ArrowDownCircle } from 'lucide-react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { UpdateContext, UpdateCheckStatus, UpdateContextValue } from './updateContext';

type InstallPhase = 'none' | 'downloading' | 'ready' | 'error';

interface UpdateCheckerProps {
  children: React.ReactNode;
}

const BYTES_PER_MB = 1024 * 1024;

/**
 * Vérifie les mises à jour au démarrage (silencieux hors ligne) et expose une
 * vérification manuelle aux enfants via `useUpdateCheck`.
 */
const UpdateChecker: React.FC<UpdateCheckerProps> = ({ children }) => {
  const [status, setStatus] = useState<UpdateCheckStatus>('idle');
  const [update, setUpdate] = useState<Update | null>(null);
  const [installPhase, setInstallPhase] = useState<InstallPhase>('none');
  const [progress, setProgress] = useState<{ downloaded: number; total?: number }>({ downloaded: 0 });
  const [installError, setInstallError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const isCheckingRef = useRef(false);

  const runCheck = useCallback(async (isManual: boolean) => {
    if (isCheckingRef.current) return;
    isCheckingRef.current = true;
    setStatus('checking');
    try {
      const result = await check();
      if (result) {
        setUpdate(result);
        setDismissed(false);
        setStatus('available');
      } else {
        setStatus('up-to-date');
      }
    } catch {
      // Hors ligne, mode dev ou démo : jamais bloquant ; signalé seulement si demandé.
      setStatus(isManual ? 'error' : 'idle');
    } finally {
      isCheckingRef.current = false;
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement asynchrone au montage (état de chargement posé avant l'await), refonte notée hors 2.2.0
    void runCheck(false);
  }, [runCheck]);

  const handleInstall = async () => {
    if (!update) return;
    setInstallPhase('downloading');
    setInstallError(null);
    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          setProgress({ downloaded: 0, total: event.data.contentLength });
        } else if (event.event === 'Progress') {
          setProgress(prev => ({ ...prev, downloaded: prev.downloaded + event.data.chunkLength }));
        } else if (event.event === 'Finished') {
          setInstallPhase('ready');
        }
      });
      await relaunch();
    } catch (err) {
      setInstallError(err instanceof Error ? err.message : 'Erreur inconnue');
      setInstallPhase('error');
    }
  };

  const contextValue = useMemo<UpdateContextValue>(
    () => ({
      status,
      availableVersion: update?.version ?? null,
      checkNow: () => runCheck(true),
    }),
    [status, update, runCheck]
  );

  const isBannerVisible = !dismissed && (installPhase !== 'none' || (status === 'available' && update !== null));
  const percent = progress.total
    ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
    : 0;
  const isError = installPhase === 'error';
  const canDismiss = installPhase === 'none' || isError;

  return (
    <UpdateContext.Provider value={contextValue}>
      {children}
      {isBannerVisible && (
        <section
          aria-label="Mise à jour de l'application"
          className="fixed bottom-4 right-4 z-40 panel shadow-lg max-w-sm w-full mx-4"
        >
          <div className="flex items-start justify-between px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2 min-w-0" aria-live="polite">
              {isError ? (
                <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0" aria-hidden="true" />
              ) : (
                <ArrowDownCircle className="h-4 w-4 text-brand-600 flex-shrink-0" aria-hidden="true" />
              )}
              <h3 className="text-sm font-semibold text-gray-800 truncate">
                {installPhase === 'none' && `Mise à jour ${update?.version ?? ''} disponible`}
                {installPhase === 'downloading' && 'Téléchargement...'}
                {installPhase === 'ready' && 'Redémarrage en cours...'}
                {isError && 'Erreur de mise à jour'}
              </h3>
            </div>
            {canDismiss && (
              <button
                onClick={() => setDismissed(true)}
                className="text-gray-500 hover:text-gray-700 transition-colors flex-shrink-0"
                aria-label="Plus tard"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="p-4">
            {installPhase === 'none' && update && (
              <>
                <p className="text-xs text-gray-600 mb-3">
                  L'application redémarrera après l'installation : enregistrez d'abord une saisie
                  en cours.
                </p>
                {update.body && (
                  <details className="mb-3">
                    <summary className="text-xs text-brand-700 cursor-pointer hover:underline">
                      Voir les notes de version
                    </summary>
                    <pre className="text-xs text-gray-600 mt-2 whitespace-pre-wrap max-h-32 overflow-auto">
                      {update.body}
                    </pre>
                  </details>
                )}
                <div className="flex justify-end gap-2">
                  <button onClick={() => setDismissed(true)} className="btn btn-default">
                    Plus tard
                  </button>
                  <button onClick={handleInstall} className="btn btn-primary">
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    Installer
                  </button>
                </div>
              </>
            )}

            {installPhase === 'downloading' && (
              <>
                <div className="h-2 bg-gray-200 rounded overflow-hidden mb-2" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full bg-brand-600 transition-all duration-150" style={{ width: `${percent}%` }} />
                </div>
                <p className="text-xs text-gray-600 tabular-nums">
                  {progress.total
                    ? `${(progress.downloaded / BYTES_PER_MB).toFixed(1)} / ${(progress.total / BYTES_PER_MB).toFixed(1)} Mo · ${percent} %`
                    : `${(progress.downloaded / BYTES_PER_MB).toFixed(1)} Mo`}
                </p>
              </>
            )}

            {installPhase === 'ready' && (
              <p className="text-xs text-gray-600">L'application va redémarrer...</p>
            )}

            {isError && (
              <>
                <p role="alert" className="text-xs text-red-700 mb-3">{installError}</p>
                <div className="flex justify-end">
                  <button onClick={() => setDismissed(true)} className="btn btn-default">
                    Fermer
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      )}
    </UpdateContext.Provider>
  );
};

export default UpdateChecker;
