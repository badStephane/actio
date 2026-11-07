import React, { useEffect, useRef, useState } from 'react';
import { Lock, Eye, EyeOff, CircleExclamationPoint, ShieldCheck, KeyRound, Info } from 'lucide-react';
import actioLogo from '../assets/brand/actio-logo.svg';
import { createInitialPassword, verifyPassword, MIN_PASSWORD_LENGTH } from '../utils/auth';
import { useRetryCountdown, formatWait } from './useRetryCountdown';
import { errorMessage } from './uiFormat';

interface LockScreenProps {
  mode: 'setup' | 'unlock';
  /** Par-dessus l'application restée montée (D4). */
  overlay?: boolean;
  onUnlocked: () => void;
  onForgot: () => void;
}

const SHAKE_MS = 400;

const LockScreen: React.FC<LockScreenProps> = ({ mode, overlay = false, onUnlocked, onForgot }) => {
  const isSetup = mode === 'setup';
  const [password1, setPassword1] = useState('');
  const [password2, setPassword2] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const shakeTimerRef = useRef<number | undefined>(undefined);
  const { secondsLeft, isWaiting, start: startWait } = useRetryCountdown();
  const isLocked = busy || isWaiting;

  useEffect(() => () => window.clearTimeout(shakeTimerRef.current), []);

  // Focus initial, puis après une erreur ou la fin d'une attente (m5).
  useEffect(() => {
    if (isLocked) return;
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [isLocked]);

  const triggerShake = () => {
    setShake(true);
    window.clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = window.setTimeout(() => setShake(false), SHAKE_MS);
  };

  const handleSetup = async () => {
    if (password1.length < MIN_PASSWORD_LENGTH) {
      setError(`Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.`);
      return;
    }
    if (password1 !== password2) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setBusy(true);
    try {
      await createInitialPassword(password1);
      onUnlocked();
    } catch (err) {
      setError(errorMessage(err, 'Impossible de créer le mot de passe. Réessayez.'));
      setBusy(false);
    }
  };

  const handleUnlock = async () => {
    setBusy(true);
    try {
      const result = await verifyPassword(password1);
      if (result.ok) {
        onUnlocked();
        return;
      }
      setPassword1('');
      triggerShake();
      if (result.retryAfterMs > 0) {
        startWait(result.retryAfterMs);
        setError('Trop d\'essais incorrects. Patientez avant de réessayer.');
      } else if (result.attemptsLeft !== undefined) {
        setError(
          `Mot de passe incorrect. Encore ${result.attemptsLeft} essai${result.attemptsLeft > 1 ? 's' : ''} avant une attente.`
        );
      } else {
        setError('Mot de passe incorrect.');
      }
    } catch (err) {
      setError(errorMessage(err, 'Erreur lors de la vérification. Réessayez.'));
    }
    setBusy(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked || !password1) return;
    setError(null);
    if (isSetup) void handleSetup();
    else void handleUnlock();
  };

  const containerClass = overlay
    ? 'fixed inset-0 z-60 flex items-center justify-center bg-brand-900'
    : 'h-full flex items-center justify-center bg-brand-900';

  return (
    <div className={containerClass} role="dialog" aria-modal="true" aria-labelledby="lock-title">
      <div className={`panel shadow-2xl w-full max-w-sm mx-4 ${shake ? 'animate-shake' : ''}`}>
        <div className="px-5 pt-5 pb-3 text-center border-b border-gray-200">
          {/* D24 : logo couleur sur fond clair */}
          <img src={actioLogo} alt="Actio" className="h-9 w-auto mx-auto mb-4" />
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-brand-50 mb-2">
            {isSetup ? (
              <ShieldCheck className="h-6 w-6 text-brand-600" aria-hidden="true" />
            ) : (
              <Lock className="h-6 w-6 text-brand-600" aria-hidden="true" />
            )}
          </div>
          <h1 id="lock-title" className="text-base font-semibold text-gray-900">
            {isSetup ? 'Configurer l\'accès' : 'Accès protégé'}
          </h1>
          <p className="text-xs text-gray-600 mt-1">
            {isSetup
              ? 'Choisissez un mot de passe pour verrouiller l\'application.'
              : 'Entrez votre mot de passe pour continuer.'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-3">
          <div>
            <label htmlFor="password1" className="block text-xs font-medium text-gray-700 mb-1">
              Mot de passe
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                id="password1"
                type={showPassword ? 'text' : 'password'}
                value={password1}
                onChange={(e) => setPassword1(e.target.value)}
                autoComplete={isSetup ? 'new-password' : 'current-password'}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'lock-error' : isSetup ? 'lock-hint' : undefined}
                className="input-field pr-9"
                disabled={isLocked}
              />
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                className="absolute right-1 top-1/2 -translate-y-1/2 p-1 rounded-sm text-gray-500 hover:text-gray-700"
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {isSetup && (
              <p id="lock-hint" className="mt-1 text-xs text-gray-600">
                Au moins {MIN_PASSWORD_LENGTH} caractères.
              </p>
            )}
          </div>

          {isSetup && (
            <div>
              <label htmlFor="password2" className="block text-xs font-medium text-gray-700 mb-1">
                Confirmer
              </label>
              <input
                id="password2"
                type={showPassword ? 'text' : 'password'}
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                autoComplete="new-password"
                className="input-field"
                disabled={isLocked}
              />
            </div>
          )}

          {error && (
            <div
              id="lock-error"
              role="alert"
              className="flex items-start gap-2 px-2 py-1.5 bg-red-50 border border-red-200 rounded-sm text-xs text-red-700"
            >
              <CircleExclamationPoint className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden="true" />
              <span>
                {error}
                {isWaiting && <> Nouvel essai possible dans <b className="tabular-nums">{formatWait(secondsLeft)}</b>.</>}
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLocked || !password1 || (isSetup && !password2)}
            className="btn btn-primary w-full justify-center py-2 disabled:opacity-50 disabled:pointer-events-none"
          >
            <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
            {busy
              ? isSetup ? 'Création...' : 'Vérification...'
              : isSetup ? 'Créer le mot de passe' : 'Déverrouiller'}
          </button>

          {isSetup ? (
            <p className="flex items-start gap-1.5 text-xs text-gray-600 pt-1">
              <Info className="h-3.5 w-3.5 shrink-0 mt-px" aria-hidden="true" />
              <span>
                Ce mot de passe verrouille l'écran de l'application ; il ne chiffre pas le fichier
                de données. Pour protéger ce fichier, activez aussi le chiffrement du disque
                (BitLocker sous Windows, FileVault sous macOS).
              </span>
            </p>
          ) : (
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={onForgot}
                className="text-xs text-gray-600 hover:text-gray-800 hover:underline"
              >
                Mot de passe oublié ?
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default LockScreen;
