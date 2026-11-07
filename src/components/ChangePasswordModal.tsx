import React, { useEffect, useRef, useState } from 'react';
import { KeyRound, X, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from './authContext';
import { MIN_PASSWORD_LENGTH } from '../utils/auth';
import { useRetryCountdown, formatWait } from './useRetryCountdown';

interface ChangePasswordModalProps {
  open: boolean;
  onClose: () => void;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ open, onClose }) => {
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const { secondsLeft, isWaiting, start: startWait } = useRetryCountdown();

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- réinitialisation de la modale à chaque ouverture, refonte notée hors 2.2.0
    setCurrent('');
    setNext('');
    setConfirm('');
    setError(null);
    setSuccess(false);
    setShowPasswords(false);
    const t = setTimeout(() => firstInputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || isWaiting) return;
    setError(null);

    if (next.length < MIN_PASSWORD_LENGTH) {
      setError(`Le nouveau mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`);
      return;
    }
    if (next !== confirm) {
      setError('Les deux nouveaux mots de passe ne correspondent pas.');
      return;
    }
    if (next === current) {
      setError('Le nouveau mot de passe doit être différent de l\'ancien.');
      return;
    }

    setBusy(true);
    const result = await changePassword(current, next);
    setBusy(false);

    if (!result.ok) {
      if (result.retryAfterMs) startWait(result.retryAfterMs);
      setError(result.error ?? 'Erreur inconnue.');
      return;
    }

    setCurrent('');
    setNext('');
    setConfirm('');
    setSuccess(true);
  };

  const inputsLocked = busy || isWaiting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-password-title"
    >
      <div
        className="panel shadow-xl max-w-sm w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-brand-600" />
            <h3 id="change-password-title" className="text-sm font-semibold text-gray-800">
              Changer le mot de passe
            </h3>
          </div>
          <button
            onClick={onClose}
            className="btn-icon -mr-2 text-ink-muted hover:text-ink hover:bg-gray-100"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {success ? (
          <div className="p-6 text-center" role="status">
            <CheckCircle className="h-10 w-10 text-emerald-600 mx-auto mb-2" aria-hidden="true" />
            <p className="text-sm font-medium text-emerald-800">Mot de passe mis à jour.</p>
            <p className="text-xs text-gray-600 mt-1">
              Votre code de récupération reste valable : inutile d'en créer un nouveau.
            </p>
            <button type="button" onClick={onClose} className="btn btn-primary mt-4">
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 space-y-3">
            <div>
              <label htmlFor="current-pwd" className="block text-xs font-medium text-gray-600 mb-1">
                Mot de passe actuel
              </label>
              <input
                ref={firstInputRef}
                id="current-pwd"
                type={showPasswords ? 'text' : 'password'}
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                className="input-field"
                disabled={inputsLocked}
              />
            </div>

            <div>
              <label htmlFor="new-pwd" className="block text-xs font-medium text-gray-600 mb-1">
                Nouveau mot de passe <span className="font-normal text-gray-600">(au moins {MIN_PASSWORD_LENGTH} caractères)</span>
              </label>
              <input
                id="new-pwd"
                type={showPasswords ? 'text' : 'password'}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                className="input-field"
                disabled={inputsLocked}
              />
            </div>

            <div>
              <label htmlFor="confirm-pwd" className="block text-xs font-medium text-gray-600 mb-1">
                Confirmer
              </label>
              <input
                id="confirm-pwd"
                type={showPasswords ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                className="input-field"
                disabled={inputsLocked}
              />
            </div>

            <button
              type="button"
              onClick={() => setShowPasswords(s => !s)}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              {showPasswords ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              {showPasswords ? 'Masquer' : 'Afficher'} les mots de passe
            </button>

            {error && (
              <div role="alert" className="flex items-start gap-2 px-2 py-1.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span>
                  {error}
                  {isWaiting && ` Nouvel essai possible dans ${formatWait(secondsLeft)}.`}
                </span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
              <button type="button" onClick={onClose} className="btn btn-default" disabled={busy}>
                Annuler
              </button>
              <button
                type="submit"
                disabled={inputsLocked || !current || !next || !confirm}
                className="btn btn-primary disabled:opacity-50 disabled:pointer-events-none"
              >
                {busy ? 'Enregistrement...' : 'Mettre à jour'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ChangePasswordModal;
