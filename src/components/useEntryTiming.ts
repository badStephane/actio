import { useCallback, useRef } from 'react';
import { isTimingEnabled, recordTimingSample } from './entryTiming';

/** Chronométrage local (D22) : du premier caractère tapé à l'enregistrement réussi. */
export const useEntryTiming = () => {
  const startRef = useRef<number | null>(null);

  const markInput = useCallback(() => {
    if (startRef.current === null && isTimingEnabled()) startRef.current = performance.now();
  }, []);

  const recordSaved = useCallback(() => {
    if (startRef.current !== null) recordTimingSample(performance.now() - startRef.current);
    startRef.current = null;
  }, []);

  const reset = useCallback(() => {
    startRef.current = null;
  }, []);

  return { markInput, recordSaved, reset };
};
