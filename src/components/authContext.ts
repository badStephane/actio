import { createContext, useContext } from 'react';

export interface ChangePasswordResult {
  ok: boolean;
  error?: string;
  /** Attente imposée après trop d'essais du mot de passe actuel. */
  retryAfterMs?: number;
}

export interface AuthContextValue {
  lock: () => void;
  changePassword: (current: string, next: string) => Promise<ChangePasswordResult>;
  autoLockMinutes: number;
  setAutoLockMinutes: (minutes: number) => void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthGate>');
  return ctx;
};
