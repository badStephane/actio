import React, { useCallback, useEffect, useState } from 'react';
import { LifeBuoy, X, AlertCircle, CheckCircle, Trash2, RefreshCw } from 'lucide-react';
import { hasRecoveryCode, generateRecoveryCode, clearRecoveryCode } from '../utils/auth';
import ConfirmModal from './ConfirmModal';
import RecoveryCodeDisplay from './RecoveryCodeDisplay';
import { errorMessage } from './uiFormat';

interface RecoveryCodeModalProps {
  open: boolean;
  onClose: () => void;
}

type LoadState = 'loading' | 'error' | 'ready';

/**
 * Gestion du code de récupération : il est généré par l'application (D2),
 * affiché une seule fois, et sa suppression demande confirmation (m20).
 */
const RecoveryCodeModal: React.FC<RecoveryCodeModalProps> = ({ open, onClose }) => {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [hasCode, setHasCode] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  // Tant que le code affiché n'est pas confirmé noté, on ne ferme pas par mégarde.
  const canClose = !busy && (!newCode || acknowledged);

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      setHasCode(await hasRecoveryCode());
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setNewCode(null);
    setAcknowledged(false);
    setError(null);
    setSuccess(null);
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open || !canClose || clearOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose, canClose, clearOpen]);

  if (!open) return null;

  const handleGenerate = async () => {
    setError(null);
    setBusy(true);
    try {
      setNewCode(await generateRecoveryCode());
      setAcknowledged(false);
      setHasCode(true);
    } catch (err) {
      setError(errorMessage(err, 'Le code n\'a pas pu être créé.'));
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async () => {
    setError(null);
    setBusy(true);
    try {
      await clearRecoveryCode();
      setHasCode(false);
      setSuccess('Code de récupération supprimé. En cas d\'oubli du mot de passe, seule la réinitialisation complète restera possible.');
    } catch (err) {
      setError(errorMessage(err, 'Erreur lors de la suppression.'));
    } finally {
      setBusy(false);
      setClearOpen(false);
    }
  };

  const renderBody = () => {
    if (success) {
      return (
        <div className="p-6 text-center" role="status">
          <CheckCircle className="h-10 w-10 text-emerald-600 mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm text-gray-800">{success}</p>
        </div>
      );
    }
    if (loadState === 'loading') {
      return (
        <div className="flex justify-center items-center py-10" aria-busy="true">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-brand-500 border-t-transparent" />
        </div>
      );
    }
    if (loadState === 'error') {
      return (
        <div className="p-4 space-y-3" role="alert">
          <p className="text-sm text-gray-800">Impossible de lire l'état du code de récupération.</p>
          <button type="button" onClick={() => void load()} className="btn btn-primary">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Réessayer
          </button>
        </div>
      );
    }
    if (newCode) {
      return (
        <div className="p-4">
          <RecoveryCodeDisplay code={newCode} acknowledged={acknowledged} onAcknowledgedChange={setAcknowledged} />
        </div>
      );
    }
    return (
      <div className="p-4 space-y-3">
        <p className="text-xs text-gray-700">
          {hasCode
            ? 'Un code de récupération est configuré. Générer un nouveau code rend l\'ancien inutilisable.'
            : 'Aucun code de récupération. Générez-en un : il permet de retrouver l\'accès si vous oubliez le mot de passe.'}
        </p>
      </div>
    );
  };

  const isMainView = loadState === 'ready' && !newCode && !success;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
        onClick={() => canClose && onClose()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recovery-code-title"
      >
        <div className="panel shadow-xl max-w-sm w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start justify-between px-4 py-3 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <LifeBuoy className="h-4 w-4 text-brand-600" aria-hidden="true" />
              <h3 id="recovery-code-title" className="text-sm font-semibold text-gray-800">
                Code de récupération
              </h3>
            </div>
            {canClose && (
              <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition-colors" aria-label="Fermer">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {renderBody()}

          {error && (
            <div role="alert" className="mx-4 mb-3 flex items-start gap-2 px-2 py-1.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-200 bg-gray-50">
            {isMainView && hasCode ? (
              <button
                type="button"
                onClick={() => setClearOpen(true)}
                disabled={busy}
                className="btn btn-ghost text-red-700 hover:bg-red-50 hover:text-red-800"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Supprimer
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              {isMainView && (
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={busy}
                  className="btn btn-primary disabled:opacity-50 disabled:pointer-events-none"
                >
                  {busy ? 'Création...' : hasCode ? 'Générer un nouveau code' : 'Générer un code'}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                disabled={!canClose}
                className="btn btn-default disabled:opacity-50 disabled:pointer-events-none"
              >
                {newCode ? 'Terminer' : 'Fermer'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={clearOpen}
        title="Supprimer le code de récupération"
        message="Sans code de récupération, un oubli du mot de passe ne laissera que la réinitialisation complète de l'application. Continuer ?"
        confirmLabel="Supprimer"
        busyLabel="Suppression..."
        busy={busy}
        variant="danger"
        onConfirm={handleClear}
        onCancel={() => setClearOpen(false)}
      />
    </>
  );
};

export default RecoveryCodeModal;
