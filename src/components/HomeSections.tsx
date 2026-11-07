import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { TriangleExclamationPoint, CalendarDays, Clock, Hourglass, CirclePlus } from 'lucide-react';
import { Activity, Registration } from '../types';
import { formatAmount, formatDateLong } from './uiFormat';
import { PAYMENT_META } from './paymentMeta';
import PaymentLogo from './PaymentLogo';
import { ActivityStatus } from './currentActivity';

export interface PaymentBreakdown {
  type: Registration['paymentType'];
  count: number;
  amount: number;
  share: number;
}

const CARD_TITLE = 'text-sm font-semibold text-ink-soft';

/** Statut de l'activité, toujours vrai (U11) : « Dans 12 jours », « Aujourd'hui », « Terminée le … ». */
export const ActivityStatusBadge: React.FC<{ status: ActivityStatus }> = ({ status }) => {
  if (status.kind === 'undated') return null;
  if (status.kind === 'past') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-warning-line bg-warning-soft text-xs font-semibold text-warning">
        <TriangleExclamationPoint className="h-3.5 w-3.5" aria-hidden="true" />
        Terminée le {formatDateLong(status.eventDate)}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
      <Hourglass className="h-4 w-4 text-ink-muted" aria-hidden="true" />
      {status.kind === 'today'
        ? <b className="font-semibold text-ink">Aujourd'hui</b>
        : <>Dans <b className="font-semibold text-ink tabular-nums">{status.days}</b> jour{status.days > 1 ? 's' : ''}</>}
    </span>
  );
};

type Scope = 'today' | 'all';

interface PaymentBreakdownCardProps {
  today: PaymentBreakdown[];
  all: PaymentBreakdown[];
  addHref: string;
}

const sumOf = (rows: PaymentBreakdown[], key: 'count' | 'amount'): number => rows.reduce((s, b) => s + b[key], 0);

/** Répartition par mode (U13) : « Aujourd'hui » par défaut pour compter la caisse du jour. */
export const PaymentBreakdownCard: React.FC<PaymentBreakdownCardProps> = ({ today, all, addHref }) => {
  const [scope, setScope] = useState<Scope>('today');
  const breakdown = scope === 'today' ? today : all;
  const count = sumOf(breakdown, 'count');
  const scopeButton = (value: Scope, label: string) => (
    <button
      type="button"
      aria-pressed={scope === value}
      onClick={() => setScope(value)}
      className={`min-h-[32px] px-2.5 text-sm rounded-control border ${
        scope === value ? 'bg-brand-600 border-brand-700 text-white font-semibold' : 'bg-white border-gray-500 text-ink-soft hover:bg-gray-50'
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="panel p-4 lg:col-span-1" aria-labelledby="payment-card-title">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <h2 id="payment-card-title" className={CARD_TITLE}>Modes de paiement</h2>
        <div className="flex gap-1" role="group" aria-label="Période">
          {scopeButton('today', "Aujourd'hui")}
          {scopeButton('all', "Toute l'activité")}
        </div>
      </div>

      {count === 0 ? (
        <div className="py-4 text-center">
          <p className="text-sm text-ink-muted mb-2">
            {scope === 'today' ? 'Aucune inscription aujourd’hui.' : 'Aucune inscription pour cette activité.'}
          </p>
          <Link to={addHref} className="inline-flex items-center gap-1 min-h-[24px] text-sm font-semibold text-brand-700 underline">
            <CirclePlus className="h-4 w-4" aria-hidden="true" />
            Nouvelle inscription
          </Link>
        </div>
      ) : (
        <>
          <p className="text-sm text-ink mb-2">
            <b className="tabular-nums">{count}</b> inscription{count > 1 ? 's' : ''} ·{' '}
            <b className="tabular-nums">{formatAmount(sumOf(breakdown, 'amount'))}</b>
          </p>
          <div className="h-2 w-full rounded-full overflow-hidden bg-gray-100 flex mb-3" aria-hidden="true">
            {breakdown.filter(b => b.count > 0).map(b => (
              <div key={b.type} className={`${PAYMENT_META[b.type].fillClass} h-full`} style={{ width: `${b.share * 100}%` }} />
            ))}
          </div>
          <ul className="space-y-2">
            {breakdown.map(b => {
              const meta = PAYMENT_META[b.type];
              return (
                <li key={b.type} className="flex items-center justify-between gap-2 text-sm">
                  <span className={`flex items-center gap-2 min-w-0 font-semibold ${meta.textClass}`}>
                    <PaymentLogo type={b.type} />
                    <span className="truncate">{meta.label}</span>
                  </span>
                  <span className="flex items-center gap-3 tabular-nums">
                    <span className="text-ink-muted">{(b.share * 100).toFixed(0)} %</span>
                    <span className="text-ink font-semibold w-8 text-right">{b.count}</span>
                    <span className="text-ink-soft w-24 text-right">{formatAmount(b.amount)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
};

/** Cinq dernières inscriptions de l'activité affichée (accueil). */
export const RecentRegistrationsCard: React.FC<{ recent: Registration[]; listHref: string }> = ({ recent, listHref }) => (
  <section className="panel p-4 lg:col-span-1">
    <div className="flex items-center justify-between mb-3">
      <h2 className={`${CARD_TITLE} flex items-center gap-1.5`}>
        <Clock className="h-4 w-4 text-ink-muted" aria-hidden="true" />
        Dernières inscriptions
      </h2>
      <Link to={listHref} className="inline-flex items-center min-h-[24px] text-sm font-semibold text-brand-700 underline">
        Tout voir
      </Link>
    </div>
    <ul className="divide-y divide-gray-100 -mx-1">
      {recent.map(r => (
        <li key={r.id} className="px-1 py-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink truncate">{r.lastName} {r.firstName}</p>
            <p className="text-xs text-ink-muted truncate">
              {formatDateLong(r.registrationDate)} · {PAYMENT_META[r.paymentType].label}
            </p>
          </div>
          <span className="text-sm font-semibold text-ink tabular-nums shrink-0">{formatAmount(r.amount)}</span>
        </li>
      ))}
    </ul>
  </section>
);

interface KpiCardProps {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  value: string;
  hint?: string;
}

/** Indicateur clé (U12, U22) : libellé en casse normale, aide en 12 px lisible. */
export const KpiCard: React.FC<KpiCardProps> = ({ icon, iconClass, label, value, hint }) => (
  <div className="panel p-4">
    <div className="flex items-start justify-between gap-2 mb-2">
      <p className="text-xs font-semibold text-ink-muted">{label}</p>
      <span className={`inline-flex items-center justify-center h-7 w-7 rounded-full shrink-0 ${iconClass}`} aria-hidden="true">
        {icon}
      </span>
    </div>
    <p className="text-2xl font-bold text-ink tabular-nums leading-tight">{value}</p>
    {hint && <p className="text-xs text-ink-muted tabular-nums mt-1">{hint}</p>}
  </div>
);

/** Détails de l'activité affichée (accueil). Plus de « Temps restant » ni de code couleur (U11, U12). */
export const ActivityDetailsCard: React.FC<{ activity: Activity | null }> = ({ activity }) => (
  <section className="panel p-4 lg:col-span-1">
    <h2 className={`${CARD_TITLE} mb-3 flex items-center gap-1.5`}>
      <CalendarDays className="h-4 w-4 text-ink-muted" aria-hidden="true" />
      Détails de l'activité
    </h2>
    {activity && (
      <dl className="space-y-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <dt className="text-ink-muted">Nom</dt>
          <dd className="text-ink font-semibold truncate">{activity.name}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-ink-muted">Date de l'événement</dt>
          <dd className="text-ink tabular-nums">{activity.eventDate ? formatDateLong(activity.eventDate) : 'Non renseignée'}</dd>
        </div>
        <div className="flex items-center justify-between gap-2">
          <dt className="text-ink-muted">Montant habituel</dt>
          <dd className="text-ink tabular-nums">
            {activity.defaultAmount !== undefined ? formatAmount(activity.defaultAmount) : 'Non renseigné'}
          </dd>
        </div>
      </dl>
    )}
  </section>
);
