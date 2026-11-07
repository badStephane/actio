import React from 'react';
import { Link } from 'react-router';
import { Pencil, Trash, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Activity, Registration } from '../types';
import { formatAmount, formatDateShort } from './uiFormat';
import PaymentBadge from './PaymentBadge';

export type SortKey = 'name' | 'date' | 'amount' | 'payment';
export type SortDirection = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

interface RegistrationTableProps {
  rows: Registration[];
  activitiesById: Record<string, Activity>;
  sortKey: SortKey | null;
  sortDirection: SortDirection;
  onToggleSort: (key: SortKey) => void;
  onDelete: (id: string) => void;
}

const SORTABLE_HEADERS: { key: SortKey; label: string; align: 'left' | 'right' }[] = [
  { key: 'name', label: 'Inscrit', align: 'left' },
  { key: 'date', label: 'Date', align: 'left' },
  { key: 'amount', label: 'Montant', align: 'right' },
  { key: 'payment', label: 'Mode de paiement', align: 'left' },
];

const RegistrationTable: React.FC<RegistrationTableProps> = ({
  rows,
  activitiesById,
  sortKey,
  sortDirection,
  onToggleSort,
  onDelete,
}) => {
  const ariaSortFor = (column: SortKey): 'ascending' | 'descending' | 'none' => {
    if (sortKey !== column) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  };

  const sortIcon = (column: SortKey) => {
    if (sortKey !== column) return <ChevronsUpDown className="h-3.5 w-3.5 ml-0.5 text-ink-muted" aria-hidden="true" />;
    return sortDirection === 'asc'
      ? <ChevronUp className="h-3.5 w-3.5 ml-0.5 text-ink" aria-hidden="true" />
      : <ChevronDown className="h-3.5 w-3.5 ml-0.5 text-ink" aria-hidden="true" />;
  };

  const sortableTh = (key: SortKey) => {
    const h = SORTABLE_HEADERS.find(x => x.key === key)!;
    return (
      <th aria-sort={ariaSortFor(key)} className={`${h.align === 'right' ? 'text-right' : 'text-left'} px-3 py-2 font-semibold text-ink-soft`}>
        <button type="button" onClick={() => onToggleSort(key)} className="inline-flex items-center min-h-[24px] rounded-control hover:text-ink">
          {h.label} {sortIcon(key)}
        </button>
      </th>
    );
  };

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
        <tr>
          {sortableTh('name')}
          <th className="text-left px-3 py-2 font-semibold text-ink-soft">Activité</th>
          <th className="text-left px-3 py-2 font-semibold text-ink-soft">Adresse</th>
          {sortableTh('date')}
          {sortableTh('amount')}
          {sortableTh('payment')}
          <th className="text-center px-3 py-2 font-semibold text-ink-soft w-24">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map(r => {
          const activity = activitiesById[r.activityId];
          const fullName = `${r.lastName} ${r.firstName}`;
          return (
            <tr key={r.id} className="hover:bg-brand-50 transition-colors duration-fast">
              <td className="px-3 py-2">
                <div className="font-semibold text-ink">{fullName}</div>
                <div className="text-ink-muted tabular-nums">{r.phone}</div>
              </td>
              <td className="px-3 py-2">
                {activity ? (
                  <span className="inline-flex items-center gap-1.5 max-w-[160px]">
                    <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: activity.color }} aria-hidden="true" />
                    <span className="truncate text-ink-soft" title={activity.name}>{activity.name}</span>
                  </span>
                ) : (
                  <span className="text-ink-muted">Activité supprimée</span>
                )}
              </td>
              <td className="px-3 py-2 text-ink-soft">
                <div className="truncate max-w-[180px]" title={r.address}>{r.address}</div>
              </td>
              <td className="px-3 py-2 text-ink-soft tabular-nums whitespace-nowrap">
                {formatDateShort(r.registrationDate)}
              </td>
              <td className="px-3 py-2 text-right font-semibold text-ink tabular-nums whitespace-nowrap">
                {formatAmount(r.amount)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <PaymentBadge type={r.paymentType} />
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-center gap-1">
                  <Link
                    to={`/edit/${r.id}`}
                    aria-label={`Modifier l'inscription de ${fullName}`}
                    title="Modifier"
                    className="btn-icon text-brand-700 hover:bg-brand-50"
                  >
                    <Pencil className="h-4 w-4" aria-hidden="true" />
                  </Link>
                  <button
                    onClick={() => onDelete(r.id)}
                    aria-label={`Supprimer l'inscription de ${fullName}`}
                    title="Supprimer"
                    className="btn-icon text-danger hover:bg-danger-soft"
                  >
                    <Trash className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};

interface PaginationBarProps {
  page: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
  total: number;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  onPageChange: (page: number) => void;
}

export const PaginationBar: React.FC<PaginationBarProps> = ({
  page, totalPages, startIndex, endIndex, total, pageSize, onPageSizeChange, onPageChange,
}) => (
  <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 bg-gray-50 text-sm text-ink-soft">
    <label className="flex items-center gap-2">
      <span>Lignes par page :</span>
      <select
        value={pageSize}
        onChange={(e) => onPageSizeChange(Number(e.target.value))}
        aria-label="Lignes par page"
        className="input-field w-auto h-8 py-0 px-1.5"
      >
        {PAGE_SIZE_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </label>
    <div className="flex items-center gap-3">
      <span>{startIndex + 1}-{endIndex} sur {total}</span>
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page <= 1}
          aria-label="Page précédente"
          title="Page précédente"
          className="btn-icon hover:bg-gray-200 disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          aria-label="Page suivante"
          title="Page suivante"
          className="btn-icon hover:bg-gray-200 disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
);

export default RegistrationTable;
