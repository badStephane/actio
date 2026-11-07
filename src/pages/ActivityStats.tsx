import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { Activity, Registration } from '../types';
import { getActivityById } from '../utils/activities';
import { getRegistrations } from '../utils/storage';
import LoadError from '../components/LoadError';
import { PAYMENT_METAS } from '../components/paymentMeta';

const formatAmount = (amount: number): string =>
  `${new Intl.NumberFormat('fr-FR').format(Math.round(amount))} F`;


const ActivityStats: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState(false);

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
    void load();
  }, [load]);

  const stats = useMemo(() => {
    if (registrations.length === 0) return null;
    const totalAmount = registrations.reduce((sum, r) => sum + r.amount, 0);
    const avgAmount = totalAmount / registrations.length;

    // Last 30 days count
    const now = Date.now();
    const last30Days = registrations.filter(r => now - new Date(r.registrationDate).getTime() <= 30 * 24 * 60 * 60 * 1000).length;

    // By payment type
    const byPayment = PAYMENT_METAS.map(meta => {
      const list = registrations.filter(r => r.paymentType === meta.type);
      return {
        name: meta.label,
        type: meta.type,
        count: list.length,
        amount: list.reduce((s, r) => s + r.amount, 0),
        color: meta.hex,
      };
    }).filter(p => p.count > 0);

    // Daily registrations over time
    const byDay = new Map<string, { count: number; amount: number }>();
    for (const r of registrations) {
      const d = r.registrationDate;
      const cur = byDay.get(d) ?? { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += r.amount;
      byDay.set(d, cur);
    }
    const timeline = Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, count: v.count, amount: v.amount }));

    return {
      total: registrations.length,
      totalAmount,
      avgAmount,
      last30Days,
      byPayment,
      timeline,
    };
  }, [registrations]);

  if (isLoading) {
    return (
      <div className="p-6 max-w-5xl">
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
      </div>
    );
  }

  if (loadError) {
    return <LoadError message="Impossible de charger les statistiques." onRetry={() => void load()} />;
  }

  if (notFound || !activity) {
    return (
      <div className="p-6">
        <div className="panel p-8 text-center max-w-md mx-auto">
          <AlertCircle className="h-10 w-10 text-red-500 mx-auto mb-3" />
          <h2 className="text-base font-semibold text-gray-800 mb-1">Activité introuvable</h2>
          <button onClick={() => navigate('/activities')} className="btn btn-primary mt-4">
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour aux activités
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => navigate('/activities')}
          className="p-1.5 rounded hover:bg-gray-200 text-gray-600"
          aria-label="Retour aux activités"
          title="Retour"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="inline-block w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: activity.color }}
          />
          <h1 className="text-base font-semibold text-gray-800 truncate">
            Statistiques · {activity.name}
          </h1>
          {activity.eventDate && (
            <span className="text-xs text-gray-500">· {new Date(activity.eventDate).toLocaleDateString('fr-FR')}</span>
          )}
        </div>
      </div>

      {!stats ? (
        <div className="panel p-8 text-center text-gray-500 text-sm">
          Aucune inscription pour cette activité : les statistiques apparaîtront dès la première inscription.
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div className="panel p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total inscriptions</p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{stats.total}</p>
            </div>
            <div className="panel p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Montant total</p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{formatAmount(stats.totalAmount)}</p>
            </div>
            <div className="panel p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Montant moyen</p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{formatAmount(stats.avgAmount)}</p>
            </div>
            <div className="panel p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">30 derniers jours</p>
              <p className="text-2xl font-bold text-gray-900 tabular-nums">{stats.last30Days}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
            {/* Payment breakdown - pie */}
            <div className="panel p-4">
              <h2 className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-3">
                Répartition par mode de paiement
              </h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.byPayment}
                      dataKey="count"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {stats.byPayment.map((p) => (
                        <Cell key={p.type} fill={p.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, _name, props) => [
                        `${Number(value)} (${formatAmount((props as { payload: { amount: number } }).payload.amount)})`,
                        (props as { payload: { name: string } }).payload.name,
                      ]}
                    />
                    <Legend
                      verticalAlign="bottom"
                      iconType="circle"
                      wrapperStyle={{ fontSize: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Amount per payment - bar */}
            <div className="panel p-4">
              <h2 className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-3">
                Montant collecté par mode
              </h2>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.byPayment}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip
                      formatter={(value) => [formatAmount(Number(value)), 'Montant']}
                      contentStyle={{ fontSize: '12px' }}
                    />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                      {stats.byPayment.map((p) => (
                        <Cell key={p.type} fill={p.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="panel p-4">
            <h2 className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-3">
              Évolution des inscriptions
            </h2>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => new Date(v).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value, name) =>
                      name === 'amount'
                        ? [formatAmount(Number(value)), 'Montant']
                        : [String(value), 'Inscriptions']
                    }
                    labelFormatter={(label) => new Date(label).toLocaleDateString('fr-FR')}
                    contentStyle={{ fontSize: '12px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="Inscriptions"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ActivityStats;
