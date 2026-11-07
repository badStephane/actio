import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, CalendarDays } from 'lucide-react';
import { Activity, Registration } from '../types';
import { formatAmount, formatDateLong } from './uiFormat';
import { PAYMENT_META } from './paymentMeta';


export interface PaymentBreakdown {
  type: Registration['paymentType'];
  count: number;
  amount: number;
  share: number;
}

/** Répartition par mode de paiement (accueil). */
export const PaymentBreakdownCard: React.FC<{ breakdown: PaymentBreakdown[] }> = ({ breakdown }) => (
    <section className="panel p-4 lg:col-span-1">
      <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">
        Modes de paiement
      </h2>

      {/* Stacked proportional bar */}
      <div className="h-2 w-full rounded-full overflow-hidden bg-gray-100 flex mb-3">
        {breakdown
          .filter(b => b.count > 0)
          .map(b => (
            <div
              key={b.type}
              className={`${PAYMENT_META[b.type].fillClass} h-full`}
              style={{ width: `${b.share * 100}%` }}
              title={`${PAYMENT_META[b.type].label} : ${(b.share * 100).toFixed(1)}%`}
            />
          ))}
      </div>

      <ul className="space-y-2">
        {breakdown.map(b => (
          <li key={b.type} className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className={`h-2 w-2 rounded-full shrink-0 ${PAYMENT_META[b.type].fillClass}`}
              />
              <span className={`font-medium truncate ${PAYMENT_META[b.type].textClass}`}>
                {PAYMENT_META[b.type].label}
              </span>
            </div>
            <div className="flex items-center gap-3 tabular-nums">
              <span className="text-gray-500">
                {(b.share * 100).toFixed(0)}%
              </span>
              <span className="text-gray-900 font-semibold w-8 text-right">
                {b.count}
              </span>
              <span className="text-gray-500 w-20 text-right">
                {formatAmount(b.amount)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
);

/** Cinq dernières inscriptions de l'activité affichée (accueil). */
export const RecentRegistrationsCard: React.FC<{ recent: Registration[] }> = ({ recent }) => (
    <section className="panel p-4 lg:col-span-1">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-gray-400" />
          Dernières inscriptions
        </h2>
        <Link
          to="/registrations"
          className="text-[11px] text-blue-600 hover:text-blue-700 hover:underline"
        >
          Tout voir
        </Link>
      </div>
      <ul className="divide-y divide-gray-100 -mx-1">
        {recent.map(r => (
          <li key={r.id} className="px-1 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-800 truncate">
                {r.lastName} {r.firstName}
              </p>
              <p className="text-[11px] text-gray-500 truncate">
                {formatDateLong(r.registrationDate)} · {PAYMENT_META[r.paymentType].label}
              </p>
            </div>
            <span className="text-xs font-semibold text-gray-900 tabular-nums shrink-0">
              {formatAmount(r.amount)}
            </span>
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

export const KpiCard: React.FC<KpiCardProps> = ({ icon, iconClass, label, value, hint }) => (
  <div className="panel p-4">
    <div className="flex items-start justify-between gap-2 mb-2">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <span
        className={`inline-flex items-center justify-center h-7 w-7 rounded-full shrink-0 ${iconClass}`}
      >
        {icon}
      </span>
    </div>
    <p className="text-2xl font-bold text-gray-900 tabular-nums leading-tight">{value}</p>
    {hint && <p className="text-[11px] text-gray-500 tabular-nums mt-1">{hint}</p>}
  </div>
);


interface ActivityDetailsCardProps {
  activity: Activity | null;
  daysToEvent: number | null;
}

/** Détails de l'activité affichée (accueil). */
export const ActivityDetailsCard: React.FC<ActivityDetailsCardProps> = ({ activity, daysToEvent }) => (
    <section className="panel p-4 lg:col-span-1">
      <h2 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <CalendarDays className="h-3.5 w-3.5 text-gray-400" />
        Détails de l'activité
      </h2>
      {activity && (
        <dl className="space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <dt className="text-gray-500">Nom</dt>
            <dd className="text-gray-900 font-medium truncate">{activity.name}</dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-gray-500">Date d'événement</dt>
            <dd className="text-gray-900 tabular-nums">
              {activity.eventDate ? formatDateLong(activity.eventDate) : '—'}
            </dd>
          </div>
          {daysToEvent !== null && (
            <div className="flex items-center justify-between gap-2">
              <dt className="text-gray-500">Temps restant</dt>
              <dd className="text-gray-900 tabular-nums">
                {daysToEvent > 0 && `Dans ${daysToEvent} jour${daysToEvent > 1 ? 's' : ''}`}
                {daysToEvent === 0 && "C'est aujourd'hui !"}
                {daysToEvent < 0 && `Il y a ${-daysToEvent} jour${-daysToEvent > 1 ? 's' : ''}`}
              </dd>
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <dt className="text-gray-500">Montant par défaut</dt>
            <dd className="text-gray-900 tabular-nums">
              {activity.defaultAmount && activity.defaultAmount > 0
                ? formatAmount(activity.defaultAmount)
                : '—'}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt className="text-gray-500">Couleur</dt>
            <dd className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: activity.color }}
              />
              <span className="text-gray-900 tabular-nums uppercase">
                {activity.color}
              </span>
            </dd>
          </div>
        </dl>
      )}
    </section>
);
