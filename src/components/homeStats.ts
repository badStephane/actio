import { Registration } from '../types';
import { PAYMENT_ORDER } from './paymentMeta';
import type { PaymentBreakdown } from './HomeSections';

export interface HomeStats {
  total: number;
  totalAmount: number;
  todayCount: number;
  todayAmount: number;
  monthCount: number;
  monthAmount: number;
  /** Moyenne par inscription, arrondie au franc. */
  average: number;
  /** Répartition sur toute l'activité. */
  breakdown: PaymentBreakdown[];
  /** Répartition du jour : la caisse à compter à la clôture du guichet (U13). */
  todayBreakdown: PaymentBreakdown[];
  recent: Registration[];
}

const RECENT_COUNT = 5;

const sumOf = (rows: readonly Registration[]): number => rows.reduce((acc, r) => acc + r.amount, 0);

export const breakdownOf = (rows: readonly Registration[]): PaymentBreakdown[] =>
  PAYMENT_ORDER.map(type => {
    const list = rows.filter(r => r.paymentType === type);
    return { type, count: list.length, amount: sumOf(list), share: rows.length > 0 ? list.length / rows.length : 0 };
  });

/** Indicateurs de l'accueil pour une activité, à la date locale `today` ('AAAA-MM-JJ'). */
export const computeHomeStats = (all: readonly Registration[], activityId: string, today: string): HomeStats => {
  const rows = all.filter(r => r.activityId === activityId);
  const todayRows = rows.filter(r => r.registrationDate === today);
  const monthRows = rows.filter(r => r.registrationDate.startsWith(today.slice(0, 7)));
  const totalAmount = sumOf(rows);
  return {
    total: rows.length,
    totalAmount,
    todayCount: todayRows.length,
    todayAmount: sumOf(todayRows),
    monthCount: monthRows.length,
    monthAmount: sumOf(monthRows),
    average: rows.length > 0 ? Math.round(totalAmount / rows.length) : 0,
    breakdown: breakdownOf(rows),
    todayBreakdown: breakdownOf(todayRows),
    recent: [...rows].sort((a, b) => b.createdAt - a.createdAt).slice(0, RECENT_COUNT),
  };
};
