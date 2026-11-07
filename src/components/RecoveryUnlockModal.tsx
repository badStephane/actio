import React, { useEffect, useRef, useState } from 'react';
import { LifeBuoy, X, CircleExclamationPoint, Eye, EyeOff } from 'lucide-react';
import {
  verifyRecoveryCode,
  updatePassword,
  generateRecoveryCode,
  MIN_PASSWORD_LENGTH,
} from '../utils/auth';
import { useRetryCountdown, formatWait } from './useRetryCountdown';
import RecoveryCodeDisplay from './RecoveryCodeDisplay';
import { errorMessage } from './uiFormat';

interface RecoveryUnlockModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onLostCode: () => void;
}

type Step = 'code' | 'new-password' | 'new-code';

const STEP_TITLE: Record<Step, string> = {
  code: 'Code de récupération',
  'new-password': 'Nouveau mot de passe',
  'new-code': 'Nouveau code de récupération',
};

const ErrorBox: React.FC<{ message: string }> = ({ message }) => (
  <div role="alert" className="flex items-start gap-2 px-2 py-1.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
    <CircleExclamationPoint className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
    <span>{message}</span>
  </div>
);

/**
 * Déverrouillage par code (D2) : le code est consommé, un nouveau mot de passe
 * est obligatoire, puis un nouveau code est affiché une seule fois.
 */
const RecoveryUnlockModal: React.FC<RecoveryUnlockModalProps> = ({ open, onClose, onSuccess, onLostCode }) => {
  const [step, setStep] = useState<Step>('code');
  const [code, setCode] = useState('');
  const [pwd1, setPwd1] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const pwdInputRef = useRef<HTMLInputElement>(null);
  const { secondsLeft, isWaiting, start: startWait } = useRetryCountdown();
  // Une fois le code consommé, on ne peut plus fermer sans finir.
  const canClose = step === 'code' && !busy;

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- réinitialisation de la modale à chaque ouverture, refonte notée hors 2.2.0
    setStep('code');
    setCode('');
    setPwd1('');
    setPwd2('');
    setError(null);
    setShowPasswords(false);
    setNewCode(null);
    setAcknowledged(false);
  }, [open]);

  useEffect(() => {
    if (!open || busy || isWaiting) return;
    const target = step === 'code' ? codeInputRef : step === 'new-password' ? pwdInputRef : null;
    const t = setTimeout(() => target?.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, step, busy, isWaiting]);

  useEffect(() => {
    if (!open || !canClose) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose, canClose]);

  if (!open) return null;

  const generateNewCode = async () => {
    setBusy(true);
    setError(null);
    try {
      setNewCode(await generateRecoveryCode());
    } catch (err) {
      setError(errorMessage(err, 'Le nouveau code n\'a pas pu être créé.'));
    }
    setBusy(false);
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || busy || isWaiting) return;
    setError(null);
    setBusy(true);
    try {
      const result = await verifyRecoveryCode(code);
      if (result.ok) {
        setStep('new-password');
      } else {
        setCode('');
        if (result.retryAfterMs > 0) {
          startWait(result.retryAfterMs);
          setError('Trop d\'essais incorrects. Patientez avant de réessayer.');
        } else {
          setError('Code de récupération incorrect.');
        }
      }
    } catch (err) {
      setError(errorMessage(err, 'Erreur lors de la vérification.'));
    }
    setBusy(false);
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (pwd1.length < MIN_PASSWORD_LENGTH) {
      setError(`Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`);
      return;
    }
    if (pwd1 !== pwd2) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    try {
      await updatePassword(pwd1);
      setPwd1('');
      setPwd2('');
      setStep('new-code');
      setBusy(false);
      await generateNewCode();
    } catch (err) {
      setError(errorMessage(err, 'Le nouveau mot de passe n\'a pas pu être enregistré. Réessayez.'));
      setBusy(false);
    }
  };

  const inputsLocked = busy || isWaiting;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => canClose && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="recovery-unlock-title"
    >
      <div className="panel shadow-xl max-w-sm w-full mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <LifeBuoy className="h-4 w-4 text-brand-600" aria-hidden="true" />
            <h3 id="recovery-unlock-title" className="text-sm font-semibold text-gray-800">
              {STEP_TITLE[step]}
            </h3>
          </div>
          {canClose && (
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 transition-colors" aria-label="Fermer">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {step === 'code' && (
          <form onSubmit={handleCodeSubmit} className="p-4 space-y-3">
            <p className="text-xs text-gray-600">
              Entrez votre code de récupération (format ABCD-EFGH-...). Il ne servira qu'une fois.
            </p>
            <div>
              <label htmlFor="rec-code" className="block text-xs font-medium text-gray-700 mb-1">
                Code de récupération
              </label>
              <input
                ref={codeInputRef}
                id="rec-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="input-field font-mono uppercase"
                disabled={inputsLocked}
              />
            </div>
            {error && (
              <ErrorBox
                message={isWaiting ? `${error} Nouvel essai possible dans ${formatWait(secondsLeft)}.` : error}
              />
            )}
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-200">
              <button type="button" onClick={onLostCode} className="text-xs text-gray-600 hover:text-gray-800 hover:underline">
                Code perdu ?
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="btn btn-default" disabled={busy}>
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={inputsLocked || !code.trim()}
                  className="btn btn-primary disabled:opacity-50 disabled:pointer-events-none"
                >
                  {busy ? 'Vérification...' : 'Continuer'}
                </button>
              </div>
            </div>
          </form>
        )}

        {step === 'new-password' && (
          <form onSubmit={handlePasswordSubmit} className="p-4 space-y-3">
            <p className="text-xs text-gray-600">
              Code accepté ; il est maintenant utilisé et ne fonctionnera plus. Définissez un nouveau
              mot de passe (au moins {MIN_PASSWORD_LENGTH} caractères).
            </p>
            <div>
              <label htmlFor="rec-new-pwd" className="block text-xs font-medium text-gray-700 mb-1">
                Nouveau mot de passe
              </label>
              <input
                ref={pwdInputRef}
                id="rec-new-pwd"
                type={showPasswords ? 'text' : 'password'}
                value={pwd1}
                onChange={(e) => setPwd1(e.target.value)}
                autoComplete="new-password"
                className="input-field"
                disabled={busy}
              />
            </div>
            <div>
              <label htmlFor="rec-new-pwd2" className="block text-xs font-medium text-gray-700 mb-1">
                Confirmer
              </label>
              <input
                id="rec-new-pwd2"
                type={showPasswords ? 'text' : 'password'}
                value={pwd2}
                onChange={(e) => setPwd2(e.target.value)}
                autoComplete="new-password"
                className="input-field"
                disabled={busy}
              />
            </div>
            <button
              type="button"
              onClick={() => setShowPasswords(s => !s)}
              aria-pressed={showPasswords}
              className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-800"
            >
              {showPasswords ? <EyeOff className="h-3 w-3" aria-hidden="true" /> : <Eye className="h-3 w-3" aria-hidden="true" />}
              {showPasswords ? 'Masquer' : 'Afficher'} les mots de passe
            </button>
            {error && <ErrorBox message={error} />}
            <div className="flex justify-end pt-2 border-t border-gray-200">
              <button
                type="submit"
                disabled={busy || !pwd1 || !pwd2}
                className="btn btn-primary disabled:opacity-50 disabled:pointer-events-none"
              >
                {busy ? 'Enregistrement...' : 'Enregistrer'}
              </button>
            </div>
          </form>
        )}

        {step === 'new-code' && (
          <div className="p-4 space-y-3">
            <p className="text-xs text-emerald-800 font-medium">Nouveau mot de passe enregistré.</p>
            {busy && <p className="text-xs text-gray-600" aria-live="polite">Création du nouveau code...</p>}
            {newCode && (
              <RecoveryCodeDisplay code={newCode} acknowledged={acknowledged} onAcknowledgedChange={setAcknowledged} />
            )}
            {error && !newCode && (
              <>
                <ErrorBox message={error} />
                <p className="text-xs text-gray-600">
                  Vous pourrez créer un code plus tard depuis le menu « Code de récupération ».
                </p>
              </>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
              {error && !newCode && (
                <>
                  <button type="button" onClick={generateNewCode} className="btn btn-default" disabled={busy}>
                    Réessayer
                  </button>
                  <button type="button" onClick={onSuccess} className="btn btn-primary" disabled={busy}>
                    Continuer sans code
                  </button>
                </>
              )}
              {newCode && (
                <button
                  type="button"
                  onClick={onSuccess}
                  disabled={!acknowledged}
                  className="btn btn-primary disabled:opacity-50 disabled:pointer-events-none"
                >
                  Terminer
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecoveryUnlockModal;
