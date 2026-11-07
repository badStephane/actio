import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  PlusCircle,
  ClipboardList,
  Users,
  Coins,
  CalendarClock,
  CalendarRange,
  CalendarDays,
  Hourglass,
  BarChart3,
} from 'lucide-react';
import { getRegistrations } from '../utils/storage';
import { getActivities } from '../utils/activities';
import { todayLocalIso } from '../utils/dates';
import { Registration, Activity } from '../types';
import LoadError from '../components/LoadError';
import ImportReviewBanner from '../components/ImportReviewBanner';
import { formatDateLong } from '../components/uiFormat';
import { PAYMENT_ORDER } from '../components/paymentMeta';
import { pickCurrentActivity, readCurrentActivityId, writeCurrentActivityId } from '../components/currentActivity';
import {
  KpiCard,
  PaymentBreakdown,
  PaymentBreakdownCard,
  ActivityDetailsCard,
  RecentRegistrationsCard,
} from '../components/HomeSections';
import { formatAmount } from '../components/uiFormat';


const todayIso = (): string => todayLocalIso();

const monthIsoPrefix = (): string => todayIso().slice(0, 7);

const daysBetween = (fromIso: string, toIso: string): number => {
  const a = new Date(fromIso);
  const b = new Date(toIso);
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return 0;
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
};


interface DashboardData {
  registrations: Registration[];
  activities: Activity[];
}

const Home: React.FC = () => {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [currentActivityId, setCurrentActivityIdState] = useState<string>(readCurrentActivityId);

  // Activité du guichet partagée avec la saisie (Lot 1, U1).
  const setCurrentActivityId = useCallback((id: string) => {
    writeCurrentActivityId(id);
    setCurrentActivityIdState(id);
  }, []);

  const load = useCallback(async () => {
    setLoadError(false);
    setData(null);
    try {
      const [registrations, activities] = await Promise.all([
        getRegistrations(),
        getActivities(true),
      ]);
      setData({ registrations, activities });
      // Auto-pick current activity if none selected, or stored id is no
      // longer valid (deleted, archived).
      const stored = readCurrentActivityId();
      const liveActivities = activities.filter(a => !a.archivedAt);
      const isStoredValid = stored && liveActivities.some(a => a.id === stored);
      if (!isStoredValid) {
        const auto = pickCurrentActivity(activities);
        if (auto) setCurrentActivityId(auto.id);
      }
    } catch {
      // M3 : une erreur n'est jamais présentée comme « aucune activité ».
      setLoadError(true);
    }
  }, [setCurrentActivityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentActivity = useMemo(() => {
    if (!data) return null;
    return data.activities.find(a => a.id === currentActivityId) ?? null;
  }, [data, currentActivityId]);

  const liveActivities = useMemo(() => {
    if (!data) return [];
    return data.activities
      .filter(a => !a.archivedAt)
      .sort((a, b) => {
        const ad = a.eventDate ?? '9999-12-31';
        const bd = b.eventDate ?? '9999-12-31';
        return ad.localeCompare(bd);
      });
  }, [data]);

  const stats = useMemo(() => {
    if (!data || !currentActivity) return null;
    const registrations = data.registrations.filter(r => r.activityId === currentActivity.id);

    const sumOf = (rs: Registration[]) => rs.reduce((acc, r) => acc + r.amount, 0);
    const today = todayIso();
    const monthPrefix = monthIsoPrefix();

    const todayList = registrations.filter(r => r.registrationDate === today);
    const monthList = registrations.filter(r => r.registrationDate.startsWith(monthPrefix));

    const total = registrations.length;
    const totalAmount = sumOf(registrations);

    const breakdown: PaymentBreakdown[] = PAYMENT_ORDER.map(type => {
      const list = registrations.filter(r => r.paymentType === type);
      return {
        type,
        count: list.length,
        amount: sumOf(list),
        share: total > 0 ? list.length / total : 0,
      };
    });

    const recent = [...registrations]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5);

    const avgTicket = total > 0 ? Math.round(totalAmount / total) : 0;

    return {
      total,
      totalAmount,
      todayCount: todayList.length,
      todayAmount: sumOf(todayList),
      monthCount: monthList.length,
      monthAmount: sumOf(monthList),
      avgTicket,
      breakdown,
      recent,
    };
  }, [data, currentActivity]);

  if (loadError) {
    return <LoadError message="Impossible de charger le tableau de bord." onRetry={() => void load()} />;
  }

  if (data === null) {
    return (
      <div className="p-6 max-w-6xl">
        <div className="skeleton h-9 w-72 rounded mb-4" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="panel p-4">
              <div className="skeleton h-3 w-24 rounded mb-2" />
              <div className="skeleton h-7 w-20 rounded" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="panel p-4 skeleton h-48" />
          <div className="panel p-4 skeleton h-48" />
          <div className="panel p-4 skeleton h-48" />
        </div>
      </div>
    );
  }

  // No activity at all
  if (liveActivities.length === 0) {
    return (
      <div className="p-6 max-w-6xl">
        <div className="panel p-8 text-center">
          <CalendarDays className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-700 mb-1">Aucune activité active</p>
          <p className="text-xs text-gray-500 mb-4">
            Créez une activité pour commencer à suivre ses inscriptions ici.
          </p>
          <Link to="/activities" className="btn btn-primary">
            <CalendarDays className="h-3.5 w-3.5" />
            Aller aux activités
          </Link>
        </div>
      </div>
    );
  }

  const isEmpty = !stats || stats.total === 0;
  // m11 : la nouvelle inscription part avec l'activité affichée présélectionnée.
  const addHref = currentActivity ? `/add?activity=${encodeURIComponent(currentActivity.id)}` : '/add';
  const daysToEvent = currentActivity?.eventDate
    ? daysBetween(todayIso(), currentActivity.eventDate)
    : null;

  return (
    <div className="p-6 max-w-6xl">
      <ImportReviewBanner />

      {/* Activity selector header */}
      <div className="mb-4 panel px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="inline-block h-3 w-3 rounded-full shrink-0"
            style={{ backgroundColor: currentActivity?.color ?? '#94a3b8' }}
          />
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
              Activité en cours
            </p>
            <p className="text-sm font-semibold text-gray-900 truncate">
              {currentActivity?.name ?? 'Aucune'}
            </p>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {currentActivity?.eventDate && (
            <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-gray-600">
              <Hourglass className="h-3.5 w-3.5 text-gray-400" />
              {daysToEvent !== null && daysToEvent > 0 && (
                <>Dans <b className="tabular-nums">{daysToEvent}</b> jour{daysToEvent > 1 ? 's' : ''}</>
              )}
              {daysToEvent === 0 && <>C'est aujourd'hui !</>}
              {daysToEvent !== null && daysToEvent < 0 && (
                <>Il y a <b className="tabular-nums">{-daysToEvent}</b> jour{-daysToEvent > 1 ? 's' : ''}</>
              )}
            </span>
          )}

          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <span className="hidden sm:inline">Activité :</span>
            <select
              value={currentActivityId}
              onChange={(e) => setCurrentActivityId(e.target.value)}
              aria-label="Choisir l'activité affichée"
              className="input-field w-auto py-1"
            >
              {liveActivities.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.eventDate ? ` · ${formatDateLong(a.eventDate)}` : ''}
                </option>
              ))}
            </select>
          </label>

          {currentActivity && (
            <Link
              to={`/activities/${currentActivity.id}/stats`}
              className="btn btn-ghost"
              title="Statistiques détaillées"
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Stats</span>
            </Link>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          iconClass="bg-slate-100 text-slate-700"
          label="Inscriptions"
          value={(stats?.total ?? 0).toLocaleString('fr-FR')}
          hint={
            stats && stats.avgTicket > 0
              ? `Panier moyen ${formatAmount(stats.avgTicket)}`
              : undefined
          }
        />
        <KpiCard
          icon={<Coins className="h-4 w-4" />}
          iconClass="bg-amber-100 text-amber-700"
          label="Montant collecté"
          value={formatAmount(stats?.totalAmount ?? 0)}
        />
        <KpiCard
          icon={<CalendarClock className="h-4 w-4" />}
          iconClass="bg-blue-100 text-blue-700"
          label="Aujourd'hui"
          value={(stats?.todayCount ?? 0).toLocaleString('fr-FR')}
          hint={stats && stats.todayCount > 0 ? formatAmount(stats.todayAmount) : '—'}
        />
        <KpiCard
          icon={<CalendarRange className="h-4 w-4" />}
          iconClass="bg-violet-100 text-violet-700"
          label="Ce mois-ci"
          value={(stats?.monthCount ?? 0).toLocaleString('fr-FR')}
          hint={stats && stats.monthCount > 0 ? formatAmount(stats.monthAmount) : '—'}
        />
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Link to={addHref} className="btn btn-primary">
          <PlusCircle className="h-3.5 w-3.5" />
          Nouvelle inscription
        </Link>
        <Link to="/registrations" className="btn btn-default">
          <ClipboardList className="h-3.5 w-3.5" />
          Voir la liste
        </Link>
      </div>

      {isEmpty ? (
        <div className="panel p-8 text-center">
          <Users className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-700 mb-1">
            Aucune inscription pour {currentActivity?.name ?? 'cette activité'}
          </p>
          <p className="text-xs text-gray-500 mb-4">
            Créez la première inscription pour cette activité.
          </p>
          <Link to={addHref} className="btn btn-primary">
            <PlusCircle className="h-3.5 w-3.5" />
            Créer une inscription
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <PaymentBreakdownCard breakdown={stats!.breakdown} />

          <ActivityDetailsCard activity={currentActivity} daysToEvent={daysToEvent} />

          <RecentRegistrationsCard recent={stats!.recent} />
        </div>
      )}
    </div>
  );
};

export default Home;
