import React, { useMemo } from 'react';
import { Users, CalendarDays, Layers } from 'lucide-react';
import { Activity, Registration } from '../types';
import { formatAmount, formatDateShort } from './uiFormat';
import { PAYMENT_METAS } from './paymentMeta';
import PaymentLogo from './PaymentLogo';

export const RegistrationListSkeleton: React.FC = () => (
  <div className="page h-full flex flex-col gap-3" aria-busy="true">
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="panel px-3 py-2">
          <div className="skeleton h-2.5 w-16 rounded mb-1.5" />
          <div className="skeleton h-4 w-20 rounded" />
        </div>
      ))}
    </div>
    <div className="toolbar border rounded-card">
      <div className="skeleton h-7 w-48 rounded" />
      <div className="skeleton h-7 w-36 rounded" />
      <div className="skeleton h-7 w-32 rounded" />
      <div className="skeleton h-7 w-20 rounded ml-2" />
      <div className="skeleton h-7 w-28 rounded" />
    </div>
    <div className="panel flex-1 overflow-hidden p-3 space-y-2">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="skeleton h-8 rounded" />
      ))}
    </div>
    <span className="sr-only">Chargement des inscriptions...</span>
  </div>
);

interface Totals {
  count: number;
  amount: number;
}

const sumTotals = (rows: Registration[]): Totals => ({
  count: rows.length,
  amount: rows.reduce((acc, r) => acc + r.amount, 0),
});

/** Bandeau de totaux, calculé sur les lignes affichées (filtres compris). */
export const RegistrationStatsStrip: React.FC<{ rows: Registration[] }> = ({ rows }) => {
  const stats = useMemo(() => ({
    all: sumTotals(rows),
    byPayment: PAYMENT_METAS.map(meta => ({
      meta,
      totals: sumTotals(rows.filter(r => r.paymentType === meta.type)),
    })),
  }), [rows]);

  if (stats.all.count === 0) return null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <div className="panel px-3 py-2">
        <div className="text-xs font-medium text-gray-600">Inscriptions</div>
        <div className="text-base font-semibold text-gray-900 tabular-nums mt-0.5">{stats.all.count}</div>
      </div>
      <div className="panel px-3 py-2">
        <div className="text-xs font-medium text-gray-600">Montant total</div>
        <div className="text-base font-semibold text-gray-900 tabular-nums mt-0.5">{formatAmount(stats.all.amount)}</div>
      </div>
      {stats.byPayment.map(({ meta, totals }) => (
        <div key={meta.type} className="panel px-3 py-2 relative overflow-hidden">
          <span className={`absolute inset-y-0 left-0 w-1 ${meta.fillClass}`} aria-hidden="true" />
          <div className={`flex items-center gap-1 text-xs font-medium ${meta.textClass}`}>
            <PaymentLogo type={meta.type} sizeClass="h-3.5 w-3.5" />
            {meta.label}
          </div>
          <div className="text-base font-semibold text-gray-900 tabular-nums mt-0.5">
            {totals.count} <span className="text-xs font-normal text-gray-600">· {formatAmount(totals.amount)}</span>
          </div>
        </div>
      ))}
    </div>
  );
};

interface ActivityPickerProps {
  activities: Activity[];
  registrations: Registration[];
  onSelect: (activityId: string) => void;
}

/** Écran de choix de la liste à consulter (toutes, ou une activité). */
export const ActivityPicker: React.FC<ActivityPickerProps> = ({ activities, registrations, onSelect }) => {
  const totalsByActivity = useMemo(() => {
    const map: Record<string, Totals> = {};
    for (const r of registrations) {
      const cur = map[r.activityId] ?? { count: 0, amount: 0 };
      map[r.activityId] = { count: cur.count + 1, amount: cur.amount + r.amount };
    }
    return map;
  }, [registrations]);
  const globalTotals = useMemo(() => sumTotals(registrations), [registrations]);
  const activeActivities = activities.filter(a => !a.archivedAt);
  const archivedActivities = activities.filter(a => a.archivedAt);

  const renderCard = (a: Activity) => {
    const s = totalsByActivity[a.id] ?? { count: 0, amount: 0 };
    const isArchived = !!a.archivedAt;
    return (
      <button
        key={a.id}
        type="button"
        onClick={() => onSelect(a.id)}
        className="panel p-4 text-left hover:border-brand-500 hover:shadow-sm transition-all duration-fast group"
      >
        <div className="flex items-start gap-2 mb-2">
          <span className="h-3 w-3 rounded-full flex-shrink-0 mt-1" style={{ backgroundColor: a.color }} aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-brand-700">{a.name}</h3>
            {isArchived && (
              <span className="inline-block mt-0.5 px-2 py-0.5 rounded-full bg-gray-200 text-xs font-semibold text-ink-soft">Archivée</span>
            )}
          </div>
        </div>
        <TotalsLine totals={s} />
        {a.eventDate && (
          <div className="mt-1.5 text-xs text-gray-600 inline-flex items-center gap-1">
            <CalendarDays className="h-3 w-3" aria-hidden="true" />
            {formatDateShort(a.eventDate)}
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="page">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-ink mb-1">Sélectionnez une liste à consulter</h2>
        <p className="text-sm text-ink-muted">
          Choisissez une activité pour afficher ses inscriptions, ou consultez toutes les inscriptions.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <button
          type="button"
          onClick={() => onSelect('')}
          className="panel p-4 text-left hover:border-brand-400 hover:shadow-sm transition-all duration-100 group border-l-2 border-l-brand-400"
        >
          <div className="flex items-start gap-2 mb-2">
            <Layers className="h-3.5 w-3.5 text-brand-600 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-gray-900 group-hover:text-brand-700">Toutes les inscriptions</h3>
              <p className="text-xs text-gray-600 mt-0.5">Vue globale, toutes activités confondues</p>
            </div>
          </div>
          <TotalsLine totals={globalTotals} />
        </button>
        {activeActivities.map(renderCard)}
      </div>
      {archivedActivities.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-ink-soft mb-2">
            Archivées ({archivedActivities.length})
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {archivedActivities.map(renderCard)}
          </div>
        </div>
      )}
    </div>
  );
};

const TotalsLine: React.FC<{ totals: Totals }> = ({ totals }) => (
  <div className="flex items-center justify-between text-xs">
    <span className="inline-flex items-center gap-1 text-gray-700">
      <Users className="h-3 w-3" aria-hidden="true" />
      <span className="tabular-nums font-medium">{totals.count}</span>
      <span className="text-gray-600">inscription{totals.count > 1 ? 's' : ''}</span>
    </span>
    <span className="text-gray-800 font-medium tabular-nums">{formatAmount(totals.amount)}</span>
  </div>
);
