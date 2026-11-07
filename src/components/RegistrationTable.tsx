import React from 'react';
import { Link } from 'react-router-dom';
import { Pencil, Trash2, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Activity, Registration } from '../types';
import { formatAmount, PAYMENT_LABEL } from './uiFormat';

export type SortKey = 'name' | 'date' | 'amount' | 'payment';
export type SortDirection = 'asc' | 'desc';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

const PAYMENT_BADGE_CLASS: Record<Registration['paymentType'], string> = {
  wave: 'bg-blue-100 text-blue-800',
  cash: 'bg-emerald-100 text-emerald-800',
  orange_money: 'bg-orange-100 text-orange-800',
};

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
  { key: 'payment', label: 'Paiement', align: 'left' },
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
    if (sortKey !== column) return <ChevronsUpDown className="h-3 w-3 ml-0.5 text-gray-500" aria-hidden="true" />;
    return sortDirection === 'asc'
      ? <ChevronUp className="h-3 w-3 ml-0.5 text-gray-700" aria-hidden="true" />
      : <ChevronDown className="h-3 w-3 ml-0.5 text-gray-700" aria-hidden="true" />;
  };

  const sortableTh = (key: SortKey) => {
    const h = SORTABLE_HEADERS.find(x => x.key === key)!;
    return (
      <th aria-sort={ariaSortFor(key)} className={`${h.align === 'right' ? 'text-right' : 'text-left'} px-3 py-2 font-medium text-gray-700`}>
        <button type="button" onClick={() => onToggleSort(key)} className="inline-flex items-center hover:text-gray-900">
          {h.label} {sortIcon(key)}
        </button>
      </th>
    );
  };

  return (
    <table className="w-full text-xs">
      <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
        <tr>
          {sortableTh('name')}
          <th className="text-left px-3 py-2 font-medium text-gray-700">Activité</th>
          <th className="text-left px-3 py-2 font-medium text-gray-700">Adresse</th>
          {sortableTh('date')}
          {sortableTh('amount')}
          {sortableTh('payment')}
          <th className="text-center px-3 py-2 font-medium text-gray-700 w-20">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {rows.map(r => {
          const activity = activitiesById[r.activityId];
          const fullName = `${r.lastName} ${r.firstName}`;
          return (
            <tr key={r.id} className="hover:bg-blue-50/50 transition-colors duration-75">
              <td className="px-3 py-2">
                <div className="font-medium text-gray-900">{fullName}</div>
                <div className="text-gray-600">{r.phone}</div>
              </td>
              <td className="px-3 py-2">
                {activity ? (
                  <span className="inline-flex items-center gap-1.5 max-w-[160px]">
                    <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: activity.color }} aria-hidden="true" />
                    <span className="truncate text-gray-700" title={activity.name}>{activity.name}</span>
                  </span>
                ) : (
                  <span className="text-gray-500">·</span>
                )}
              </td>
              <td className="px-3 py-2 text-gray-700">
                <div className="truncate max-w-[180px]" title={r.address}>{r.address}</div>
              </td>
              <td className="px-3 py-2 text-gray-700 tabular-nums whitespace-nowrap">
                {new Date(r.registrationDate).toLocaleDateString('fr-FR')}
              </td>
              <td className="px-3 py-2 text-right font-medium text-gray-900 tabular-nums whitespace-nowrap">
                {formatAmount(r.amount)}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${PAYMENT_BADGE_CLASS[r.paymentType]}`}>
                  {PAYMENT_LABEL[r.paymentType]}
                </span>
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-center gap-1">
                  <Link
                    to={`/edit/${r.id}`}
                    aria-label={`Modifier l'inscription de ${fullName}`}
                    title="Modifier"
                    className="p-1.5 rounded hover:bg-blue-100 text-blue-700 transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                  <button
                    onClick={() => onDelete(r.id)}
                    aria-label={`Supprimer l'inscription de ${fullName}`}
                    title="Supprimer"
                    className="p-1.5 rounded hover:bg-red-100 text-red-700 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
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
  <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-700">
    <label className="flex items-center gap-2">
      <span>Lignes par page :</span>
      <select
        value={pageSize}
        onChange={(e) => onPageSizeChange(Number(e.target.value))}
        aria-label="Lignes par page"
        className="input-field w-auto py-0.5 px-1.5 text-xs"
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
          className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page >= totalPages}
          aria-label="Page suivante"
          title="Page suivante"
          className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:pointer-events-none"
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  </div>
);

export default RegistrationTable;
