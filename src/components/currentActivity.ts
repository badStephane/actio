import { Activity } from '../types';
import { todayLocalIso } from '../utils/dates';

/**
 * Activité du guichet, partagée entre l'accueil et la saisie (Lot 1, U1).
 * Clé existante de l'accueil : aucune migration, la valeur survit au redémarrage.
 */
export const CURRENT_ACTIVITY_KEY = 'home.currentActivityId';

export const readCurrentActivityId = (): string => {
  try {
    return localStorage.getItem(CURRENT_ACTIVITY_KEY) ?? '';
  } catch {
    return '';
  }
};

export const writeCurrentActivityId = (id: string): void => {
  try {
    if (id) localStorage.setItem(CURRENT_ACTIVITY_KEY, id);
    else localStorage.removeItem(CURRENT_ACTIVITY_KEY);
  } catch {
    // Stockage indisponible : l'activité reste choisie pour cet écran seulement.
  }
};

export const isLiveActivity = (a: Activity): boolean => !a.archivedAt;

/** Choix automatique : prochaine activité à venir, sinon la dernière créée (logique de l'accueil). */
export const pickCurrentActivity = (activities: Activity[]): Activity | null => {
  const live = activities.filter(isLiveActivity);
  if (live.length === 0) return null;

  const today = todayLocalIso();
  const upcoming = live
    .filter(a => a.eventDate && a.eventDate >= today)
    .sort((a, b) => (a.eventDate ?? '').localeCompare(b.eventDate ?? ''));
  if (upcoming.length > 0) return upcoming[0];

  return [...live].sort((a, b) => b.createdAt - a.createdAt)[0];
};

/**
 * Activité présélectionnée à l'ouverture de la saisie :
 * `?activity=` si vivante, sinon l'activité du guichet si vivante, sinon le choix automatique.
 */
export const resolveGuichetActivity = (
  activities: Activity[],
  requestedId: string | null,
  storedId: string
): Activity | null => {
  const live = activities.filter(isLiveActivity);
  return (
    live.find(a => a.id === requestedId) ??
    live.find(a => a.id === storedId) ??
    pickCurrentActivity(activities)
  );
};

/** Vrai si la date de l'activité est passée (badge « Événement passé »). */
export const isPastActivity = (a: Activity, today: string = todayLocalIso()): boolean =>
  Boolean(a.eventDate && a.eventDate < today);
