import React from 'react';
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { PaymentType } from './paymentMeta';
import { formatAmount, formatAxisAmount, formatDateShort } from './uiFormat';

export interface PaymentSlice {
  name: string;
  type: PaymentType;
  count: number;
  amount: number;
  color: string;
}

export interface TimelinePoint {
  date: string;
  count: number;
  amount: number;
}

interface StatsChartsProps {
  byPayment: PaymentSlice[];
  timeline: TimelinePoint[];
}

const INK_SOFT = '#374151';
const BRAND_600 = '#2563B8';
const GRID = '#E5E7EB';
const AXIS_TICK = { fontSize: 12, fill: INK_SOFT };
const CARD_TITLE = 'text-sm font-semibold text-ink-soft mb-3';
/** Largeur de l'axe des montants : « 1 500 000 » doit tenir sans être coupé. */
const AMOUNT_AXIS_WIDTH = 80;

/** U19 : animations des graphiques coupées si l'utilisateur réduit les mouvements (lu une fois). */
const PREFERS_REDUCED_MOTION =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
const isAnimationActive = !PREFERS_REDUCED_MOTION;

/** « 03/11 » à partir de 'AAAA-MM-JJ', sans objet Date. */
const dayMonth = (iso: string): string => formatDateShort(iso).slice(0, 5);

/** Légende en encre lisible, la couleur reste portée par la pastille (U18). */
const legendText = (value: string) => <span style={{ color: INK_SOFT }}>{value}</span>;

/** Graphiques de la page Statistiques (Lot 2, 2.4) + alternative texte pour lecteurs d'écran (m22). */
const StatsCharts: React.FC<StatsChartsProps> = ({ byPayment, timeline }) => (
  <>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-4">
      <section className="panel p-4" aria-labelledby="chart-pie-title">
        <h2 id="chart-pie-title" className={CARD_TITLE}>Répartition par mode de paiement</h2>
        <div className="h-64" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={byPayment} dataKey="count" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2} isAnimationActive={isAnimationActive}>
                {byPayment.map(p => <Cell key={p.type} fill={p.color} />)}
              </Pie>
              <Tooltip formatter={(value, _name, item) => [`${Number(value)} (${formatAmount((item.payload as PaymentSlice).amount)})`, (item.payload as PaymentSlice).name]} />
              <Legend verticalAlign="bottom" iconType="circle" formatter={legendText} wrapperStyle={{ fontSize: '14px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="panel p-4" aria-labelledby="chart-bar-title">
        <h2 id="chart-bar-title" className={CARD_TITLE}>Montant collecté par mode</h2>
        <div className="h-64" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byPayment}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
              <XAxis dataKey="name" tick={AXIS_TICK} />
              <YAxis tick={AXIS_TICK} width={AMOUNT_AXIS_WIDTH} tickFormatter={(v: number) => formatAxisAmount(v)} />
              <Tooltip formatter={(value) => [formatAmount(Number(value)), 'Montant']} contentStyle={{ fontSize: '14px' }} />
              <Bar dataKey="amount" radius={[4, 4, 0, 0]} isAnimationActive={isAnimationActive}>
                {byPayment.map(p => <Cell key={p.type} fill={p.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>

    <section className="panel p-4" aria-labelledby="chart-line-title">
      <h2 id="chart-line-title" className={CARD_TITLE}>Évolution des inscriptions</h2>
      <div className="h-64" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={timeline}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
            <XAxis dataKey="date" tick={AXIS_TICK} tickFormatter={dayMonth} />
            <YAxis tick={AXIS_TICK} allowDecimals={false} />
            <Tooltip
              formatter={(value) => [String(value), 'Inscriptions']}
              labelFormatter={(label) => formatDateShort(String(label))}
              contentStyle={{ fontSize: '14px' }}
            />
            <Legend formatter={legendText} wrapperStyle={{ fontSize: '14px' }} />
            <Line type="monotone" dataKey="count" name="Inscriptions" stroke={BRAND_600} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={isAnimationActive} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>

    <table className="sr-only">
      <caption>Inscriptions et montants par mode de paiement</caption>
      <thead><tr><th scope="col">Mode</th><th scope="col">Inscriptions</th><th scope="col">Montant</th></tr></thead>
      <tbody>
        {byPayment.map(p => <tr key={p.type}><th scope="row">{p.name}</th><td>{p.count}</td><td>{formatAmount(p.amount)}</td></tr>)}
      </tbody>
    </table>
    <table className="sr-only">
      <caption>Inscriptions par jour</caption>
      <thead><tr><th scope="col">Date</th><th scope="col">Inscriptions</th><th scope="col">Montant</th></tr></thead>
      <tbody>
        {timeline.map(t => <tr key={t.date}><th scope="row">{formatDateShort(t.date)}</th><td>{t.count}</td><td>{formatAmount(t.amount)}</td></tr>)}
      </tbody>
    </table>
  </>
);

export default StatsCharts;
