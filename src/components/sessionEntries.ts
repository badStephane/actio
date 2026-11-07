import { Registration } from '../types';
import { PAYMENT_ORDER, PaymentType } from './paymentMeta';

/**
 * « Saisies de cette session » (Lot 1, 1.3) : mémoire locale du guichet, en sessionStorage,
 * vidée à la fermeture de l'application. Aucun appel nouveau à la couche données.
 */
export interface SessionEntry {
  id: string;
  lastName: string;
  firstName: string;
  amount: number;
  paymentType: PaymentType;
  activityId: string;
  /** Horodatage de création (ms). */
  createdAt: number;
}

export interface SessionTotals {
  count: number;
  amount: number;
  byPayment: { type: PaymentType; count: number; amount: number }[];
}

export const SESSION_ENTRIES_KEY = 'actio.saisie.session';
/** Plafond par activité : changer d'activité ne fait pas perdre les saisies de l'autre. */
export const MAX_SESSION_ENTRIES = 20;
/** Garde-fou de lecture (contenu de sessionStorage altéré ou très nombreuses activités). */
export const MAX_STORED_SESSION_ENTRIES = 500;
export const VISIBLE_SESSION_ENTRIES = 5;

export const toSessionEntry = (r: Registration): SessionEntry => ({
  id: r.id,
  lastName: r.lastName,
  firstName: r.firstName,
  amount: r.amount,
  paymentType: r.paymentType,
  activityId: r.activityId,
  createdAt: r.createdAt,
});

/** Ajoute en tête, sans doublon d'id, en gardant les 20 plus récentes de son activité. */
export const addSessionEntry = (entries: readonly SessionEntry[], entry: SessionEntry): SessionEntry[] => {
  const next = [entry, ...entries.filter(e => e.id !== entry.id)];
  const sameActivity = next.filter(e => e.activityId === entry.activityId);
  if (sameActivity.length <= MAX_SESSION_ENTRIES) return next;
  const dropped = new Set(sameActivity.slice(MAX_SESSION_ENTRIES).map(e => e.id));
  return next.filter(e => !dropped.has(e.id));
};

/**
 * Le panneau ne montre que l'activité du guichet (décision PM) : additionner plusieurs
 * activités donnerait une caisse fausse, comme l'ancien total de la Liste.
 */
export const entriesForActivity = (entries: readonly SessionEntry[], activityId: string): SessionEntry[] =>
  entries.filter(e => e.activityId === activityId);

/**
 * Réaligne les entrées sur la base : une inscription supprimée ailleurs disparaît,
 * une inscription modifiée reprend ses valeurs actuelles.
 */
export const reconcileSessionEntries = (
  entries: readonly SessionEntry[],
  current: ReadonlyMap<string, Registration | null>
): SessionEntry[] =>
  entries.flatMap(entry => {
    if (!current.has(entry.id)) return [entry];
    const found = current.get(entry.id);
    return found ? [{ ...toSessionEntry(found), createdAt: entry.createdAt }] : [];
  });

export const computeSessionTotals = (entries: readonly SessionEntry[]): SessionTotals => ({
  count: entries.length,
  amount: entries.reduce((sum, e) => sum + e.amount, 0),
  byPayment: PAYMENT_ORDER.map(type => {
    const list = entries.filter(e => e.paymentType === type);
    return { type, count: list.length, amount: list.reduce((sum, e) => sum + e.amount, 0) };
  }),
});

const isSessionEntry = (value: unknown): value is SessionEntry => {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.lastName === 'string' &&
    typeof v.firstName === 'string' &&
    typeof v.amount === 'number' &&
    typeof v.activityId === 'string' &&
    typeof v.createdAt === 'number' &&
    PAYMENT_ORDER.includes(v.paymentType as PaymentType)
  );
};

/** Lecture tolérante : un contenu illisible donne une session vide. */
export const readSessionEntries = (storage: Storage = sessionStorage): SessionEntry[] => {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SESSION_ENTRIES_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isSessionEntry).slice(0, MAX_STORED_SESSION_ENTRIES) : [];
  } catch {
    return [];
  }
};

export const writeSessionEntries = (entries: readonly SessionEntry[], storage: Storage = sessionStorage): void => {
  try {
    storage.setItem(SESSION_ENTRIES_KEY, JSON.stringify(entries));
  } catch {
    // Stockage plein ou indisponible : le panneau reste juste pour l'écran affiché.
  }
};
