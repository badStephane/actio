import { createContext, useContext } from 'react';

export type UpdateCheckStatus = 'idle' | 'checking' | 'up-to-date' | 'available' | 'error';

export interface UpdateContextValue {
  status: UpdateCheckStatus;
  availableVersion: string | null;
  /** Vérification manuelle (Préférences, SRE m11) ; ne lève jamais. */
  checkNow: () => Promise<void>;
}

export const UpdateContext = createContext<UpdateContextValue | null>(null);

export const useUpdateCheck = (): UpdateContextValue => {
  const ctx = useContext(UpdateContext);
  if (!ctx) throw new Error('useUpdateCheck doit être utilisé dans <UpdateChecker>');
  return ctx;
};
