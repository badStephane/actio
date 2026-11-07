import { Activity, Registration } from '../types';
import { getDb } from './db';
import { logEvent } from './audit';
import { DEMO_MODE } from './demo';
import { getRegistrations } from './storage';
import { getActivities } from './activities';
import { isRealDate, toIsoDateString } from './dates';

/**
 * Contrôle des imports faits avant la version 2.1.0 (avenant A1) : l'ancien import xlsx a pu
 * diviser des montants par 1000 (« 5,000 » lu 5) et inverser jour et mois. Rien n'est corrigé
 * automatiquement : on signale, l'opérateur décide (correction via updateRegistration, ou
 * « C'est correct » via markReviewed).
 */

export type SuspicionReason = 'non_integer' | 'amount_too_small' | 'date_ambiguous';

export interface SuspiciousRegistration {
  registration: Registration;
  reasons: SuspicionReason[];
  originalAmount?: number;
  suggestedAmount?: number;
  suggestedDate?: string;
  batchSize: number;
}

export interface ReviewRow {
  registration_id: string;
  original_amount: number;
  reason: string;
  reviewed_at: number | null;
}

/** Un lot importé = au moins 3 inscriptions d'une même activité créées dans la même seconde. */
export const MIN_BATCH_SIZE = 3;
/** Sous ce montant, une inscription importée peut être un « x,000 » lu comme décimale. */
export const SMALL_AMOUNT_THRESHOLD = 1000;
const THOUSAND = 1000;
/** Raison posée par markReviewed sur une ligne qui n'était pas dans amount_review. */
const MANUAL_REVIEW_REASON = 'manual_review';

const batchKey = (r: Registration): string => `${r.activityId}|${Math.floor(r.createdAt / 1000)}`;

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

/** Date avec jour et mois inversés si l'inversion est plausible (jour et mois <= 12, différents). */
export const swappedDate = (iso: string): string | undefined => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return undefined;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (day > 12 || month > 12 || day === month) return undefined;
  return isRealDate(year, day, month) ? toIsoDateString(year, day, month) : undefined;
};

/**
 * Cœur pur de l'heuristique.
 * @param importedBefore seules les inscriptions créées avant cet instant (ms) sont considérées
 *   comme issues de l'ancien import ; les imports faits avec la version corrigée ne sont pas suspects.
 */
export const detectSuspicious = (
  registrations: Registration[],
  activities: Activity[],
  reviews: ReviewRow[],
  importedBefore: number
): SuspiciousRegistration[] => {
  const reviewById = new Map(reviews.map((r) => [r.registration_id, r]));
  const defaultAmountById = new Map(activities.map((a) => [a.id, a.defaultAmount]));
  // Map locale construite en une passe (une copie par itération serait quadratique sur 5 000 lignes).
  const batches = new Map<string, Registration[]>();
  for (const r of registrations) {
    if (r.createdAt >= importedBefore) continue;
    const key = batchKey(r);
    const list = batches.get(key);
    if (list) list.push(r);
    else batches.set(key, [r]);
  }
  const importedBatch = (r: Registration): Registration[] => {
    const batch = batches.get(batchKey(r)) ?? [];
    return batch.length >= MIN_BATCH_SIZE && r.createdAt < importedBefore ? batch : [];
  };

  return registrations.flatMap((registration): SuspiciousRegistration[] => {
    const review = reviewById.get(registration.id);
    if (review?.reviewed_at != null) return [];
    const batch = importedBatch(registration);
    const isImported = batch.length > 0;
    const reasons: SuspicionReason[] = [];
    let suggestedAmount: number | undefined;
    let suggestedDate: string | undefined;

    if (review?.reason === 'non_integer') reasons.push('non_integer');

    const { amount } = registration;
    const batchMedian = median(batch.map((r) => r.amount));
    const activityDefault = defaultAmountById.get(registration.activityId) ?? 0;
    if (
      isImported &&
      amount > 0 &&
      amount < SMALL_AMOUNT_THRESHOLD &&
      (activityDefault >= SMALL_AMOUNT_THRESHOLD || batchMedian >= SMALL_AMOUNT_THRESHOLD)
    ) {
      reasons.push('amount_too_small');
      suggestedAmount = amount * THOUSAND;
    }

    const swapped = isImported ? swappedDate(registration.registrationDate) : undefined;
    if (swapped) {
      reasons.push('date_ambiguous');
      suggestedDate = swapped;
    }

    if (reasons.length === 0) return [];
    return [
      {
        registration,
        reasons,
        originalAmount: review?.reason === 'non_integer' ? review.original_amount : undefined,
        suggestedAmount,
        suggestedDate,
        batchSize: batch.length,
      },
    ];
  });
};

/** Instant d'application de la migration 11 (correctif de l'import), en ms. */
const fixInstalledAt = async (): Promise<number> => {
  const db = await getDb();
  const rows = await db.select<{ t: number | null }[]>(
    "SELECT CAST(strftime('%s', installed_on) AS INTEGER) * 1000 AS t FROM _sqlx_migrations WHERE version = 11"
  );
  return rows[0]?.t ?? Date.now();
};

export const findSuspiciousRegistrations = async (): Promise<SuspiciousRegistration[]> => {
  if (DEMO_MODE) return [];
  const db = await getDb();
  const [registrations, activities, reviews, importedBefore] = await Promise.all([
    getRegistrations(),
    getActivities(true),
    db.select<ReviewRow[]>('SELECT registration_id, original_amount, reason, reviewed_at FROM amount_review'),
    fixInstalledAt(),
  ]);
  return detectSuspicious(registrations, activities, reviews, importedBefore);
};

/** « C'est correct » : la ligne sort de la liste des suspects. Journalisé. */
export const markReviewed = async (registrationId: string): Promise<void> => {
  if (DEMO_MODE) return;
  const db = await getDb();
  const rows = await db.select<{ amount: number; last_name: string; first_name: string }[]>(
    'SELECT amount, last_name, first_name FROM registrations WHERE id = $1',
    [registrationId]
  );
  const row = rows[0];
  if (!row) throw new Error('Inscription introuvable.');
  await db.execute(
    `INSERT INTO amount_review (registration_id, original_amount, reason, reviewed_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (registration_id) DO UPDATE SET reviewed_at = excluded.reviewed_at`,
    [registrationId, row.amount, MANUAL_REVIEW_REASON, Date.now()]
  );
  await logEvent(
    'updated',
    'registration',
    registrationId,
    `${row.last_name} ${row.first_name} · contrôle d'import : confirmé correct`
  );
};
