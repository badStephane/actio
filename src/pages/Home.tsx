import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { CirclePlus, ClipboardList, Users, Coins, CalendarClock, CalendarRange, CalendarDays, ChartColumn } from 'lucide-react';
import { getRegistrations } from '../utils/storage';
import { getActivities } from '../utils/activities';
import { todayLocalIso } from '../utils/dates';
import { Registration, Activity } from '../types';
import LoadError from '../components/LoadError';
import ImportReviewBanner from '../components/ImportReviewBanner';
import { formatAmount, formatDateLong } from '../components/uiFormat';
import {
  activityHeading,
  activityStatus,
  pickCurrentActivity,
  readCurrentActivityId,
  writeCurrentActivityId,
} from '../components/currentActivity';
import { computeHomeStats } from '../components/homeStats';
import {
  ActivityDetailsCard,
  ActivityStatusBadge,
  KpiCard,
  PaymentBreakdownCard,
  RecentRegistrationsCard,
} from '../components/HomeSections';

interface DashboardData {
  registrations: Registration[];
  activities: Activity[];
}

const HomeSkeleton: React.FC = () => (
  <div className="page" aria-busy="true">
    <div className="skeleton h-14 w-full rounded mb-4" />
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
    <span className="sr-only">Chargement du tableau de bord...</span>
  </div>
);

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
      const [registrations, activities] = await Promise.all([getRegistrations(), getActivities(true)]);
      setData({ registrations, activities });
      // Activité mémorisée supprimée ou archivée : choix automatique (U11).
      const stored = readCurrentActivityId();
      const isStoredValid = stored && activities.some(a => !a.archivedAt && a.id === stored);
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement asynchrone au montage (état de chargement posé avant l'await), refonte notée hors 2.2.0
    void load();
  }, [load]);

  const today = todayLocalIso();
  const currentActivity = data?.activities.find(a => a.id === currentActivityId) ?? null;

  const liveActivities = useMemo(
    () =>
      (data?.activities ?? [])
        .filter(a => !a.archivedAt)
        .sort((a, b) => (a.eventDate ?? '9999-12-31').localeCompare(b.eventDate ?? '9999-12-31')),
    [data]
  );

  const stats = useMemo(
    () => (data && currentActivity ? computeHomeStats(data.registrations, currentActivity.id, today) : null),
    [data, currentActivity, today]
  );

  if (loadError) {
    return <LoadError message="Impossible de charger le tableau de bord." onRetry={() => void load()} />;
  }
  if (data === null) return <HomeSkeleton />;

  if (liveActivities.length === 0) {
    return (
      <div className="page">
        <div className="panel p-8 text-center">
          <CalendarDays className="h-8 w-8 text-ink-muted mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm font-semibold text-ink mb-1">Aucune activité active</p>
          <p className="text-sm text-ink-muted mb-4">Créez une activité pour commencer à suivre ses inscriptions ici.</p>
          <Link to="/activities" className="btn btn-primary">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            Aller aux activités
          </Link>
        </div>
      </div>
    );
  }

  const isEmpty = !stats || stats.total === 0;
  // m11 : la nouvelle inscription part avec l'activité affichée présélectionnée.
  const addHref = currentActivity ? `/add?activity=${encodeURIComponent(currentActivity.id)}` : '/add';
  const listHref = currentActivity ? `/registrations?activity=${encodeURIComponent(currentActivity.id)}` : '/registrations';
  const status = currentActivity ? activityStatus(currentActivity, today) : null;
  const heading = activityHeading(status ?? { kind: 'undated' });

  return (
    <div className="page">
      <ImportReviewBanner />

      {/* Barre d'activité (U11, U13) : statut toujours vrai, action principale à portée. */}
      {/* Lot 3, c) : deux groupes ; s'ils ne tiennent pas sur une ligne, le groupe d'actions passe
          entier à la ligne, aligné à droite, sans séparer ses contrôles. */}
      <div className="mb-4 panel px-4 py-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <div className="flex items-center gap-x-4 gap-y-2 min-w-0 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="inline-block h-3 w-3 rounded-full shrink-0 border border-gray-500"
              style={{ backgroundColor: heading.isNeutralDot ? '#E5E7EB' : currentActivity?.color ?? '#9CA3AF' }}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-ink-muted">{heading.label}</p>
              <p className="text-base font-semibold text-ink truncate">{currentActivity?.name ?? 'Aucune'}</p>
            </div>
          </div>
          {status && <ActivityStatusBadge status={status} />}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <label className="flex items-center">
            <span className="sr-only">Activité affichée</span>
            <select
              value={currentActivityId}
              onChange={(e) => setCurrentActivityId(e.target.value)}
              title="Changer l'activité affichée"
              className="input-field w-auto max-w-[15rem] h-control"
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
            <Link to={`/activities/${currentActivity.id}/stats`} className="btn btn-default btn-sm">
              <ChartColumn className="h-4 w-4" aria-hidden="true" />
              Statistiques
            </Link>
          )}
          <Link to={listHref} className="btn btn-default btn-sm">
            <ClipboardList className="h-4 w-4" aria-hidden="true" />
            Voir la liste
          </Link>
          <Link to={addHref} className="btn btn-brand btn-lg">
            <CirclePlus className="h-4 w-4" aria-hidden="true" />
            Nouvelle inscription
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <KpiCard
          icon={<Users className="h-4 w-4" />}
          iconClass="bg-slate-100 text-slate-700"
          label="Inscriptions"
          value={(stats?.total ?? 0).toLocaleString('fr-FR')}
          hint={stats && stats.average > 0 ? `Moyenne par inscription : ${formatAmount(stats.average)}` : undefined}
        />
        <KpiCard
          icon={<Coins className="h-4 w-4" />}
          iconClass="bg-amber-100 text-amber-700"
          label="Montant collecté"
          value={formatAmount(stats?.totalAmount ?? 0)}
        />
        <KpiCard
          icon={<CalendarClock className="h-4 w-4" />}
          iconClass="bg-brand-100 text-brand-700"
          label="Aujourd'hui"
          value={(stats?.todayCount ?? 0).toLocaleString('fr-FR')}
          hint={stats && stats.todayCount > 0 ? formatAmount(stats.todayAmount) : 'Aucune aujourd’hui'}
        />
        <KpiCard
          icon={<CalendarRange className="h-4 w-4" />}
          iconClass="bg-violet-100 text-violet-700"
          label="Ce mois-ci"
          value={(stats?.monthCount ?? 0).toLocaleString('fr-FR')}
          hint={stats && stats.monthCount > 0 ? formatAmount(stats.monthAmount) : 'Aucune ce mois-ci'}
        />
      </div>

      {isEmpty ? (
        <div className="panel p-8 text-center">
          <Users className="h-8 w-8 text-ink-muted mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm font-semibold text-ink mb-1">
            Aucune inscription pour {currentActivity?.name ?? 'cette activité'}
          </p>
          <p className="text-sm text-ink-muted mb-4">Créez la première inscription pour cette activité.</p>
          <Link to={addHref} className="btn btn-primary">
            <CirclePlus className="h-3.5 w-3.5" aria-hidden="true" />
            Créer une inscription
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <PaymentBreakdownCard today={stats.todayBreakdown} all={stats.breakdown} addHref={addHref} />
          <ActivityDetailsCard activity={currentActivity} />
          <RecentRegistrationsCard recent={stats.recent} listHref={listHref} />
        </div>
      )}
    </div>
  );
};

export default Home;
