import type { Activity, Registration } from '../types';
import { todayLocalIso } from '../utils/dates';
import type { SortDirection, SortKey } from './RegistrationTable';

/**
 * Mémoire de la Liste (Lot 2, 2.2, U14) : dernière liste ouverte, filtres, tri et page, en
 * sessionStorage. L'écran de choix ne s'affiche qu'au premier passage de la session.
 */
export interface ListFilters {
  search: string;
  payment: string;
  activity: string;
  dateFrom: string;
  dateTo: string;
}

export interface ListState {
  filters: ListFilters;
  sortKey: SortKey | null;
  sortDirection: SortDirection;
  page: number;
  pageSize: number;
}

export const LIST_MEMORY_KEY = 'actio.liste.memoire';
export const DEFAULT_PAGE_SIZE = 25;
export const EMPTY_FILTERS: ListFilters = { search: '', payment: '', activity: '', dateFrom: '', dateTo: '' };

export const defaultListState = (activity = ''): ListState => ({
  filters: { ...EMPTY_FILTERS, activity },
  sortKey: null,
  sortDirection: 'asc',
  page: 1,
  pageSize: DEFAULT_PAGE_SIZE,
});

const SORT_KEYS: readonly SortKey[] = ['name', 'date', 'amount', 'payment'];

const isListState = (v: unknown): v is ListState => {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  const f = s.filters as Record<string, unknown> | undefined;
  return (
    typeof f === 'object' && f !== null &&
    (Object.keys(EMPTY_FILTERS) as (keyof ListFilters)[]).every(k => typeof f[k] === 'string') &&
    (s.sortKey === null || SORT_KEYS.includes(s.sortKey as SortKey)) &&
    (s.sortDirection === 'asc' || s.sortDirection === 'desc') &&
    Number.isInteger(s.page) && (s.page as number) >= 1 &&
    Number.isInteger(s.pageSize) && (s.pageSize as number) >= 1
  );
};

export const readListMemory = (storage: Storage = sessionStorage): ListState | null => {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(LIST_MEMORY_KEY) ?? 'null');
    return isListState(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

export const writeListMemory = (state: ListState, storage: Storage = sessionStorage): void => {
  try {
    storage.setItem(LIST_MEMORY_KEY, JSON.stringify(state));
  } catch {
    // Stockage indisponible : la liste repartira de l'écran de choix au prochain passage.
  }
};

/**
 * État de départ de la Liste.
 * - `?activity=` absent : la liste mémorisée, sinon l'écran de choix (premier passage).
 * - `?activity=` égal à la liste mémorisée : on la rouvre telle quelle (retour de modification).
 * - autre activité demandée : cette liste, sans filtre.
 */
export const resolveInitialListState = (
  memory: ListState | null,
  requestedActivity: string
): { state: ListState; showPicker: boolean } => {
  if (!requestedActivity) {
    return memory ? { state: memory, showPicker: false } : { state: defaultListState(), showPicker: true };
  }
  if (memory && memory.filters.activity === requestedActivity) return { state: memory, showPicker: false };
  return { state: defaultListState(requestedActivity), showPicker: false };
};

// --- Filtres, tri et nom d'export (déplacés de RegistrationList.tsx) -------------------------

const slugify = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');

const compareRegistrations = (a: Registration, b: Registration, key: SortKey): number => {
  switch (key) {
    case 'name':
      return `${a.lastName} ${a.firstName}`.toLowerCase().localeCompare(`${b.lastName} ${b.firstName}`.toLowerCase(), 'fr');
    case 'date':
      return a.registrationDate.localeCompare(b.registrationDate);
    case 'amount':
      return a.amount - b.amount;
    case 'payment':
      return a.paymentType.localeCompare(b.paymentType);
  }
};

export const applyFilters = (
  rows: Registration[],
  f: ListFilters,
  sortKey: SortKey | null,
  dir: SortDirection
): Registration[] => {
  const term = f.search.toLowerCase();
  const filtered = rows.filter(r =>
    (!term || [r.firstName, r.lastName, r.phone, r.address].some(v => v.toLowerCase().includes(term))) &&
    (!f.payment || r.paymentType === f.payment) &&
    (!f.activity || r.activityId === f.activity) &&
    (!f.dateFrom || r.registrationDate >= f.dateFrom) &&
    (!f.dateTo || r.registrationDate <= f.dateTo)
  );
  if (!sortKey) return filtered;
  const sign = dir === 'asc' ? 1 : -1;
  return [...filtered].sort((a, b) => compareRegistrations(a, b, sortKey) * sign);
};

export const buildExportFilename = (f: ListFilters, activity: Activity | undefined): string => {
  const parts = [f.activity ? (activity ? slugify(activity.name) : '') : 'inscriptions'];
  if (f.dateFrom && f.dateTo) parts.push(`${f.dateFrom}_au_${f.dateTo}`);
  else if (f.dateFrom) parts.push(`depuis_${f.dateFrom}`);
  else if (f.dateTo) parts.push(`jusqu_${f.dateTo}`);
  else parts.push(todayLocalIso());
  return parts.filter(Boolean).join('_');
};
