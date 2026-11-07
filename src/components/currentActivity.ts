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

/**
 * Choix automatique (U11) : la prochaine activité à venir ; à défaut la plus récemment passée ;
 * à défaut (aucune date) la dernière créée.
 */
export const pickCurrentActivity = (activities: Activity[], today: string = todayLocalIso()): Activity | null => {
  const live = activities.filter(isLiveActivity);
  if (live.length === 0) return null;

  const byDate = (a: Activity, b: Activity) => (a.eventDate ?? '').localeCompare(b.eventDate ?? '');
  const upcoming = live.filter(a => a.eventDate && a.eventDate >= today).sort(byDate);
  if (upcoming.length > 0) return upcoming[0];

  const past = live.filter(a => a.eventDate && a.eventDate < today).sort(byDate);
  if (past.length > 0) return past[past.length - 1];

  return [...live].sort((a, b) => b.createdAt - a.createdAt)[0];
};

const DAY_MS = 86_400_000;

/** Jours entre deux dates 'AAAA-MM-JJ', en UTC pur (aucun effet de fuseau ni d'heure d'été). */
export const daysBetweenIso = (fromIso: string, toIso: string): number => {
  const utc = (iso: string) => {
    const [y, m, d] = iso.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(toIso) - utc(fromIso)) / DAY_MS);
};

export type ActivityStatus =
  | { kind: 'undated' }
  | { kind: 'upcoming'; days: number }
  | { kind: 'today' }
  | { kind: 'past'; eventDate: string };

/**
 * Libellé de la barre d'activité de l'accueil (Lot 3, a) : « en cours » seulement si l'activité a
 * lieu aujourd'hui ou plus tard. Sinon « Activité suivie » : le mot décrit le rôle du tableau de bord
 * (l'activité qu'il suit), pas l'état de l'événement, et ne contredit donc jamais « Terminée le … ».
 * Une activité terminée perd sa pastille de couleur au profit d'une pastille neutre.
 */
export const activityHeading = (status: ActivityStatus): { label: string; isNeutralDot: boolean } => {
  if (status.kind === 'today' || status.kind === 'upcoming') return { label: 'Activité en cours', isNeutralDot: false };
  return { label: 'Activité suivie', isNeutralDot: status.kind === 'past' };
};

/** Statut toujours vrai de l'activité (U11) : jamais « en cours » avec une durée passée. */
export const activityStatus = (a: Pick<Activity, 'eventDate'>, today: string = todayLocalIso()): ActivityStatus => {
  if (!a.eventDate) return { kind: 'undated' };
  const days = daysBetweenIso(today, a.eventDate);
  if (days > 0) return { kind: 'upcoming', days };
  if (days === 0) return { kind: 'today' };
  return { kind: 'past', eventDate: a.eventDate };
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
