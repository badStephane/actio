import React, { useMemo } from 'react';
import { Link } from 'react-router';
import { SessionEntry, VISIBLE_SESSION_ENTRIES, computeSessionTotals } from './sessionEntries';
import { displayName } from './registrationFormModel';
import { formatAmount } from './uiFormat';
import PaymentBadge from './PaymentBadge';

interface SessionPanelProps {
  /** Saisies de l'activité du guichet uniquement (filtrées par l'appelant). */
  entries: SessionEntry[];
  activityName?: string;
  listHref: string;
  listLabel: string;
}

const formatTime = (ts: number): string =>
  new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

const plural = (n: number, word: string): string => `${word}${n > 1 ? 's' : ''}`;

/**
 * « Saisies de cette session » (Lot 1, 1.3) : contrôle immédiat de la caisse.
 * Noms et montants en encre principale (17:1) pour la lecture en extérieur (correction PM).
 */
const SessionPanel: React.FC<SessionPanelProps> = ({ entries, activityName, listHref, listLabel }) => {
  const totals = useMemo(() => computeSessionTotals(entries), [entries]);
  const visible = entries.slice(0, VISIBLE_SESSION_ENTRIES);
  const olderCount = entries.length - visible.length;

  return (
    <aside aria-labelledby="session-title" className="panel rounded-card shadow-card w-full xl:w-84 shrink-0">
      <h2 id="session-title" className="px-4 py-3 border-b border-gray-200 text-sm font-semibold text-ink">
        Saisies de cette session{activityName ? ` · ${activityName}` : ''}
      </h2>

      {entries.length === 0 ? (
        <p className="px-4 py-6 text-sm text-ink-muted">
          Aucune saisie pour cette activité pour l'instant. Chaque inscription enregistrée s'affichera ici
          pour vérification.
        </p>
      ) : (
        <>
          <div className="px-4 py-3 border-b border-gray-200">
            <p className="text-sm text-ink">
              <b className="text-2xl font-semibold tabular-nums">{totals.count}</b> {plural(totals.count, 'inscription')} ·{' '}
              <b className="text-lg font-semibold tabular-nums">{formatAmount(totals.amount)}</b>
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {totals.byPayment.map(p => (
                <PaymentBadge key={p.type} type={p.type} suffix={`${p.count} · ${formatAmount(p.amount)}`} />
              ))}
            </div>
          </div>

          <ul>
            {visible.map(entry => {
              const name = displayName(entry);
              return (
                <li key={entry.id} className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-center gap-2 px-4 py-2 border-b border-gray-100">
                  <span className="text-xs text-ink-muted tabular-nums">{formatTime(entry.createdAt)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink" title={name}>{name}</span>
                    <PaymentBadge type={entry.paymentType} />
                  </span>
                  <span className="text-right">
                    <span className="block text-sm font-semibold text-ink tabular-nums">{formatAmount(entry.amount)}</span>
                    <Link
                      to={`/edit/${encodeURIComponent(entry.id)}?retour=saisie`}
                      className="inline-flex items-center min-h-[24px] px-1 text-sm font-semibold text-brand-700 underline hover:text-brand-900 rounded-control"
                    >
                      Modifier{' '}<span className="sr-only">l'inscription de {name}</span>
                    </Link>
                  </span>
                </li>
              );
            })}
          </ul>

          {olderCount > 0 && (
            <p className="px-4 py-2.5 text-sm text-ink-muted">
              et {olderCount} {plural(olderCount, 'plus ancienne')} ·{' '}
              <Link to={listHref} className="inline-flex items-center min-h-[24px] font-semibold text-brand-700 underline">
                {listLabel}
              </Link>
            </p>
          )}
        </>
      )}
    </aside>
  );
};

export default SessionPanel;
