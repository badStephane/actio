/**
 * Chronométrage local de la saisie (D22) : désactivé par défaut, activé dans les Préférences.
 * Mesure la durée entre le premier caractère tapé et l'enregistrement réussi.
 * Les durées restent dans le localStorage du poste ; rien n'est envoyé nulle part.
 */
export const TIMING_ENABLED_KEY = 'actio.mesure.active';
export const TIMING_SAMPLES_KEY = 'actio.mesure.durees';
export const MAX_TIMING_SAMPLES = 200;
/** Au-delà, la saisie a été interrompue (pause, client parti) : la mesure n'a pas de sens. */
export const MAX_SAMPLE_MS = 30 * 60 * 1000;

const safeGet = (storage: Storage, key: string): string | null => {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
};

const safeSet = (storage: Storage, key: string, value: string | null): void => {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // Stockage indisponible : la mesure est simplement perdue, sans effet sur la saisie.
  }
};

export const isTimingEnabled = (storage: Storage = localStorage): boolean =>
  safeGet(storage, TIMING_ENABLED_KEY) === '1';

export const setTimingEnabled = (enabled: boolean, storage: Storage = localStorage): void =>
  safeSet(storage, TIMING_ENABLED_KEY, enabled ? '1' : null);

export const readTimingSamples = (storage: Storage = localStorage): number[] => {
  try {
    const parsed: unknown = JSON.parse(safeGet(storage, TIMING_SAMPLES_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((n): n is number => typeof n === 'number' && n > 0) : [];
  } catch {
    return [];
  }
};

/** Ajoute une durée si la mesure est active et la durée plausible ; garde les 200 plus récentes. */
export const recordTimingSample = (durationMs: number, storage: Storage = localStorage): boolean => {
  if (!isTimingEnabled(storage)) return false;
  if (!Number.isFinite(durationMs) || durationMs <= 0 || durationMs > MAX_SAMPLE_MS) return false;
  const next = [...readTimingSamples(storage), Math.round(durationMs)].slice(-MAX_TIMING_SAMPLES);
  safeSet(storage, TIMING_SAMPLES_KEY, JSON.stringify(next));
  return true;
};

export const clearTimingSamples = (storage: Storage = localStorage): void =>
  safeSet(storage, TIMING_SAMPLES_KEY, null);

export const median = (values: readonly number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** « 42 s » ou « 1 min 05 s ». */
export const formatDuration = (ms: number): string => {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes} min ${seconds} s`;
};
