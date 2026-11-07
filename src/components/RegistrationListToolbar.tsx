import React from 'react';
import { ArrowLeft, Download, Layers, Search } from 'lucide-react';
import { Activity } from '../types';
import { PAYMENT_METAS } from './paymentMeta';
import { ListFilters } from './registrationListModel';

interface RegistrationListToolbarProps {
  filters: ListFilters;
  selectedActivity: Activity | undefined;
  shownCount: number;
  totalCount: number;
  onChangeList: () => void;
  onFilterChange: (key: keyof ListFilters, value: string) => void;
  onExport: () => void;
}

/**
 * Barre d'outils de la Liste en deux rangées voulues (Lot 3, c) : 1) quelle liste et ce qu'on en
 * fait (changer, compter, exporter) ; 2) les filtres. Chaque rangée tient sur une ligne à 1366 et
 * les deux commencent au même bord gauche, au lieu d'un repli au hasard de la largeur.
 */
const RegistrationListToolbar: React.FC<RegistrationListToolbarProps> = ({
  filters, selectedActivity, shownCount, totalCount, onChangeList, onFilterChange, onExport,
}) => (
  <div className="border-b border-gray-200 bg-surface-subtle rounded-t-card">
    <div className="flex flex-wrap items-center gap-2 px-3 py-2">
      <button type="button" onClick={onChangeList} className="btn btn-default btn-sm">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Changer de liste
      </button>
      <h2 className="inline-flex items-center gap-1.5 min-w-0 text-base font-semibold text-ink" aria-live="polite">
        {filters.activity ? (
          <>
            <span className="h-2.5 w-2.5 rounded-full flex-shrink-0 border border-gray-500" style={{ backgroundColor: selectedActivity?.color ?? '#9CA3AF' }} aria-hidden="true" />
            <span className="truncate">{selectedActivity?.name ?? 'Activité supprimée'}</span>
          </>
        ) : (
          <>
            <Layers className="h-4 w-4 text-ink-muted flex-shrink-0" aria-hidden="true" />
            <span className="truncate">Toutes les activités</span>
          </>
        )}
      </h2>
      <div className="ml-auto flex items-center gap-3">
        <span className="text-sm text-ink-muted tabular-nums">
          {shownCount} / {totalCount} inscription{totalCount > 1 ? 's' : ''}
        </span>
        <button
          type="button"
          onClick={onExport}
          disabled={shownCount === 0}
          className="btn btn-success btn-sm disabled:opacity-50 disabled:pointer-events-none"
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Exporter Excel
        </button>
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-2 px-3 pb-2" role="search" aria-label="Filtres de la liste">
      <div className="relative">
        <label htmlFor="list-search" className="sr-only">Rechercher par nom, prénom ou téléphone</label>
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" aria-hidden="true" />
        <input
          id="list-search"
          type="search"
          placeholder="Nom, prénom ou téléphone"
          value={filters.search}
          onChange={(e) => onFilterChange('search', e.target.value)}
          className="input-field h-8 pl-8 w-72"
        />
      </div>
      <select
        value={filters.payment}
        onChange={(e) => onFilterChange('payment', e.target.value)}
        aria-label="Filtrer par mode de paiement"
        className="input-field w-auto h-8 py-0"
      >
        <option value="">Tous les modes de paiement</option>
        {PAYMENT_METAS.map(m => (
          <option key={m.type} value={m.type}>{m.label}</option>
        ))}
      </select>
      <label className="flex items-center gap-1 text-sm text-ink-soft">
        Du
        <input type="date" value={filters.dateFrom} onChange={(e) => onFilterChange('dateFrom', e.target.value)}
          max={filters.dateTo || undefined} aria-label="Date de début" className="input-field w-auto h-8 py-0" />
      </label>
      <label className="flex items-center gap-1 text-sm text-ink-soft">
        Au
        <input type="date" value={filters.dateTo} onChange={(e) => onFilterChange('dateTo', e.target.value)}
          min={filters.dateFrom || undefined} aria-label="Date de fin" className="input-field w-auto h-8 py-0" />
      </label>
    </div>
  </div>
);

export default RegistrationListToolbar;
