import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  hasPassword,
  hasRecoveryCode,
  verifyPassword,
  updatePassword,
  MIN_PASSWORD_LENGTH,
} from '../utils/auth';
import { resetAppData, BACKUP_DIR_LABEL } from '../utils/dbBackup';
import { DEMO_MODE } from '../utils/demo';
import { AuthContext, AuthContextValue, ChangePasswordResult } from './authContext';
import ConfirmModal from './ConfirmModal';
import RecoveryUnlockModal from './RecoveryUnlockModal';
import LockScreen from './LockScreen';
import AuthErrorScreen from './AuthErrorScreen';
import { errorMessage } from './uiFormat';

interface AuthGateProps {
  children: React.ReactNode;
}

type Phase = 'loading' | 'error' | 'setup' | 'lock' | 'unlocked';

const AUTO_LOCK_STORAGE_KEY = 'autoLockMinutes';
const RESET_CONFIRM_WORD = 'EFFACER';
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'];

const readAutoLockMinutes = (): number => {
  const stored = localStorage.getItem(AUTO_LOCK_STORAGE_KEY);
  const parsed = stored ? parseInt(stored, 10) : 0;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

const RESET_MESSAGE = (
  <>
    <p>
      Les inscriptions, activités, contacts, l'historique, le mot de passe et le code de
      récupération seront supprimés de l'application.
    </p>
    <p>
      Une sauvegarde automatique de l'état actuel est conservée avant l'effacement, dans :{' '}
      <span className="font-medium text-gray-800">{BACKUP_DIR_LABEL}</span>. L'application
      redémarrera ensuite.
    </p>
  </>
);

const changePasswordWith = async (current: string, next: string): Promise<ChangePasswordResult> => {
  if (next.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `Le mot de passe doit faire au moins ${MIN_PASSWORD_LENGTH} caractères.` };
  }
  try {
    const check = await verifyPassword(current);
    if (!check.ok) {
      return check.retryAfterMs > 0
        ? { ok: false, error: 'Trop d\'essais incorrects. Patientez avant de réessayer.', retryAfterMs: check.retryAfterMs }
        : { ok: false, error: 'Mot de passe actuel incorrect.' };
    }
    await updatePassword(next);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err, 'Erreur lors du changement de mot de passe.') };
  }
};

const ProtectedGate: React.FC<AuthGateProps> = ({ children }) => {
  const [phase, setPhase] = useState<Phase>('loading');
  const [hasUnlockedOnce, setHasUnlockedOnce] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [recoveryUnlockOpen, setRecoveryUnlockOpen] = useState(false);
  const [recoveryAvailable, setRecoveryAvailable] = useState(false);
  const [autoLockMinutes, setAutoLockMinutesState] = useState<number>(readAutoLockMinutes);
  const appRef = useRef<HTMLDivElement>(null);

  const setAutoLockMinutes = useCallback((minutes: number) => {
    const safe = Number.isFinite(minutes) && minutes >= 0 ? minutes : 0;
    localStorage.setItem(AUTO_LOCK_STORAGE_KEY, String(safe));
    setAutoLockMinutesState(safe);
  }, []);

  const checkPasswordState = useCallback(async () => {
    setPhase('loading');
    setCheckError(null);
    try {
      const exists = await hasPassword();
      setPhase(exists ? 'lock' : 'setup');
    } catch (err) {
      setCheckError(errorMessage(err, ''));
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void checkPasswordState();
  }, [checkPasswordState]);

  useEffect(() => {
    if (phase !== 'lock') return;
    let cancelled = false;
    hasRecoveryCode()
      .then(v => { if (!cancelled) setRecoveryAvailable(v); })
      .catch(() => { if (!cancelled) setRecoveryAvailable(false); });
    return () => { cancelled = true; };
  }, [phase]);

  const isOverlayLocked = phase === 'lock' && hasUnlockedOnce;

  // D4 : l'application reste montée sous l'écran de verrouillage, mais inerte.
  useEffect(() => {
    const el = appRef.current;
    if (!el) return;
    if (isOverlayLocked) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  }, [isOverlayLocked]);

  const unlock = useCallback(() => {
    setRecoveryUnlockOpen(false);
    setHasUnlockedOnce(true);
    setPhase('unlocked');
  }, []);

  const lock = useCallback(() => {
    setPhase(prev => (prev === 'unlocked' ? 'lock' : prev));
  }, []);

  useEffect(() => {
    if (phase !== 'unlocked' || autoLockMinutes <= 0) return;
    const ms = autoLockMinutes * 60 * 1000;
    let timer = window.setTimeout(lock, ms);
    const restart = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(lock, ms);
    };
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, restart, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, restart));
    };
  }, [phase, autoLockMinutes, lock]);

  const handleForgot = () => {
    setResetError(null);
    if (recoveryAvailable) setRecoveryUnlockOpen(true);
    else setResetOpen(true);
  };

  const handleReset = async () => {
    setIsResetting(true);
    setResetError(null);
    try {
      await resetAppData();
      // resetAppData redémarre l'application ; rechargement de repli.
      window.location.reload();
    } catch (err) {
      setIsResetting(false);
      setResetOpen(false);
      setResetError(errorMessage(err, 'La réinitialisation a échoué. Aucune donnée n\'a été effacée.'));
    }
  };

  const contextValue = useMemo<AuthContextValue>(
    () => ({ lock, changePassword: changePasswordWith, autoLockMinutes, setAutoLockMinutes }),
    [lock, autoLockMinutes, setAutoLockMinutes]
  );

  if (phase === 'error') {
    return <AuthErrorScreen detail={checkError} onRetry={() => void checkPasswordState()} />;
  }

  if (phase === 'loading' && !hasUnlockedOnce) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100" aria-busy="true">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-500 border-t-transparent" />
        <span className="sr-only">Chargement...</span>
      </div>
    );
  }

  const lockLayer = (phase === 'lock' || phase === 'setup') && (
    <>
      <LockScreen
        mode={phase === 'setup' ? 'setup' : 'unlock'}
        overlay={hasUnlockedOnce}
        onUnlocked={unlock}
        onForgot={handleForgot}
      />
      {/* Contexte d'empilement au-dessus de l'écran de verrouillage (z-60). */}
      <div className="relative z-[65]">
        {resetError && (
          <div role="alert" className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] panel border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 max-w-sm">
            {resetError}
          </div>
        )}
        <ConfirmModal
          open={resetOpen}
          title="Réinitialiser l'application"
          message={RESET_MESSAGE}
          confirmLabel="Tout effacer"
          busyLabel="Effacement..."
          busy={isResetting}
          confirmText={RESET_CONFIRM_WORD}
          variant="danger"
          onConfirm={handleReset}
          onCancel={() => setResetOpen(false)}
        />
        <RecoveryUnlockModal
          open={recoveryUnlockOpen}
          onClose={() => setRecoveryUnlockOpen(false)}
          onSuccess={unlock}
          onLostCode={() => {
            setRecoveryUnlockOpen(false);
            setResetOpen(true);
          }}
        />
      </div>
    </>
  );

  if (!hasUnlockedOnce) return <>{lockLayer}</>;

  return (
    <AuthContext.Provider value={contextValue}>
      <div ref={appRef} className="h-full" aria-hidden={isOverlayLocked || undefined}>
        {children}
      </div>
      {lockLayer}
    </AuthContext.Provider>
  );
};

/**
 * En mode démonstration, l'écran de verrouillage est désactivé : l'application
 * est directement accessible avec un contexte d'authentification neutralisé.
 */
const DEMO_CONTEXT: AuthContextValue = {
  lock: () => {},
  changePassword: async () => ({ ok: true }),
  autoLockMinutes: 0,
  setAutoLockMinutes: () => {},
};

const DemoGate: React.FC<AuthGateProps> = ({ children }) => (
  <AuthContext.Provider value={DEMO_CONTEXT}>{children}</AuthContext.Provider>
);

const AuthGate: React.FC<AuthGateProps> = DEMO_MODE ? DemoGate : ProtectedGate;

export default AuthGate;
