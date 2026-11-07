import { useCallback, useEffect, useState } from 'react';

const TICK_MS = 250;

/**
 * Attente imposée après des essais ratés (VerifyResult.retryAfterMs).
 * `start(ms)` démarre l'attente ; `secondsLeft` vaut 0 quand on peut réessayer.
 */
export const useRetryCountdown = () => {
  const [retryUntil, setRetryUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (retryUntil <= Date.now()) return;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= retryUntil) window.clearInterval(timer);
    }, TICK_MS);
    return () => window.clearInterval(timer);
  }, [retryUntil]);

  const start = useCallback((ms: number) => {
    if (ms <= 0) return;
    const current = Date.now();
    setNow(current);
    setRetryUntil(current + ms);
  }, []);

  const secondsLeft = Math.max(0, Math.ceil((retryUntil - now) / 1000));
  return { secondsLeft, isWaiting: secondsLeft > 0, start };
};

export const formatWait = (seconds: number): string => {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${String(rest).padStart(2, '0')} s`;
};
