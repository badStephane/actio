import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AlertCircle, Download } from 'lucide-react';
import { Activity, Registration } from '../types';
import { getActivityById } from '../utils/activities';
import { getRegistrations } from '../utils/storage';
import { exportToExcel } from '../utils/excelExport';
import { todayLocalIso } from '../utils/dates';
import LoadError from '../components/LoadError';
import Toast from '../components/Toast';
import StatsCharts, { PaymentSlice, TimelinePoint } from '../components/StatsCharts';
import { useToast } from '../components/useToast';
import { PAYMENT_METAS } from '../components/paymentMeta';
import { daysBetweenIso } from '../components/currentActivity';
import { errorMessage, formatAmount, formatDateShort } from '../components/uiFormat';

const LAST_DAYS = 30;

const slugify = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');

const KpiTile: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="panel p-4">
    <p className="text-xs font-semibold text-ink-muted mb-1">{label}</p>
    <p className="text-2xl font-bold text-ink tabular-nums">{value}</p>
  </div>
);

const StatsSkeleton: React.FC = () => (
  <div className="page" aria-busy="true">
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="panel p-4">
          <div className="skeleton h-3 w-24 rounded mb-2" />
          <div className="skeleton h-7 w-16 rounded" />
        </div>
      ))}
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
      <div className="panel p-4 skeleton h-64" />
      <div className="panel p-4 skeleton h-64" />
    </div>
    <span className="sr-only">Chargement des statistiques...</span>
  </div>
);

const ActivityStats: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const { toast, showToast, closeToast } = useToast();

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setLoadError(false);
    setNotFound(false);
    try {
      const [a, all] = await Promise.all([getActivityById(id), getRegistrations()]);
      if (!a) {
        setNotFound(true);
      } else {
        setActivity(a);
        setRegistrations(all.filter(r => r.activityId === id));
      }
    } catch {
      // M3 : erreur de lecture distincte de « activité introuvable ».
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement asynchrone au montage (état de chargement posé avant l'await), refonte notée hors 2.2.0
    void load();
  }, [load]);

  const stats = useMemo(() => {
    if (registrations.length === 0) return null;
    const totalAmount = registrations.reduce((sum, r) => sum + r.amount, 0);
    const today = todayLocalIso();
    const last30Days = registrations.filter(r => {
      const age = daysBetweenIso(r.registrationDate, today);
      return age >= 0 && age <= LAST_DAYS;
    }).length;

    const byPayment: PaymentSlice[] = PAYMENT_METAS.map(meta => {
      const list = registrations.filter(r => r.paymentType === meta.type);
      return {
        name: meta.label,
        type: meta.type,
        count: list.length,
        amount: list.reduce((s, r) => s + r.amount, 0),
        color: meta.hex,
      };
    }).filter(p => p.count > 0);

    const byDay = new Map<string, TimelinePoint>();
    for (const r of registrations) {
      const cur = byDay.get(r.registrationDate) ?? { date: r.registrationDate, count: 0, amount: 0 };
      byDay.set(r.registrationDate, { ...cur, count: cur.count + 1, amount: cur.amount + r.amount });
    }
    const timeline = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));

    return {
      total: registrations.length,
      totalAmount,
      average: Math.round(totalAmount / registrations.length),
      last30Days,
      byPayment,
      timeline,
    };
  }, [registrations]);

  /** U19 : export Excel depuis la page Statistiques (besoin du responsable). */
  const handleExport = () => {
    if (!activity || registrations.length === 0) return;
    try {
      exportToExcel(registrations, [activity], `${slugify(activity.name)}_${todayLocalIso()}`);
    } catch (err) {
      showToast('error', errorMessage(err, 'L\'export Excel a échoué.'));
    }
  };

  if (isLoading) return <StatsSkeleton />;

  if (loadError) {
    return <LoadError message="Impossible de charger les statistiques." onRetry={() => void load()} />;
  }

  if (notFound || !activity) {
    return (
      <div className="p-6">
        <div className="panel p-8 text-center max-w-md mx-auto">
          <AlertCircle className="h-10 w-10 text-danger mx-auto mb-3" aria-hidden="true" />
          <h2 className="text-base font-semibold text-ink mb-1">Activité introuvable</h2>
          <button type="button" onClick={() => navigate('/activities')} className="btn btn-primary mt-4">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Retour aux activités
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          type="button"
          onClick={() => navigate('/activities')}
          className="btn-icon text-ink-soft hover:bg-gray-200"
          aria-label="Retour aux activités"
          title="Retour"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-block w-3 h-3 rounded-full flex-shrink-0 border border-gray-500" style={{ backgroundColor: activity.color }} aria-hidden="true" />
          <h1 className="text-xl font-semibold text-ink truncate">Statistiques · {activity.name}</h1>
          {activity.eventDate && (
            <span className="text-sm text-ink-muted tabular-nums">· {formatDateShort(activity.eventDate)}</span>
          )}
        </div>
        {registrations.length > 0 && (
          <button type="button" onClick={handleExport} className="ml-auto btn btn-success btn-sm">
            <Download className="h-4 w-4" aria-hidden="true" />
            Exporter Excel
          </button>
        )}
      </div>

      {!stats ? (
        <div className="panel p-8 text-center text-ink-muted text-sm">
          Aucune inscription pour cette activité : les statistiques apparaîtront dès la première inscription.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <KpiTile label="Total des inscriptions" value={String(stats.total)} />
            <KpiTile label="Montant total" value={formatAmount(stats.totalAmount)} />
            <KpiTile label="Moyenne par inscription" value={formatAmount(stats.average)} />
            <KpiTile label={`${LAST_DAYS} derniers jours`} value={String(stats.last30Days)} />
          </div>
          <StatsCharts byPayment={stats.byPayment} timeline={stats.timeline} />
        </>
      )}

      <Toast open={toast.open} variant={toast.variant} message={toast.message} onClose={closeToast} />
    </div>
  );
};

export default ActivityStats;
