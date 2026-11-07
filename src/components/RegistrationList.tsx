import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Search, ClipboardList, PlusCircle, ArrowLeft, Layers } from 'lucide-react';
import { getRegistrations, deleteRegistration } from '../utils/storage';
import { exportToExcel } from '../utils/excelExport';
import { getActivities } from '../utils/activities';
import { Registration, Activity } from '../types';
import ConfirmModal from './ConfirmModal';
import Toast from './Toast';
import LoadError from './LoadError';
import RegistrationTable, { PaginationBar, SortKey } from './RegistrationTable';
import { ActivityPicker, RegistrationListSkeleton, RegistrationStatsStrip } from './RegistrationListParts';
import { useToast } from './useToast';
import { useFlashToast } from './useFlashToast';
import { errorMessage } from './uiFormat';
import { PAYMENT_METAS } from './paymentMeta';
import {
  EMPTY_FILTERS,
  ListFilters,
  ListState,
  applyFilters,
  buildExportFilename,
  defaultListState,
  readListMemory,
  resolveInitialListState,
  writeListMemory,
} from './registrationListModel';

const RegistrationList: React.FC = () => {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  // U14 : la liste, ses filtres, son tri et sa page sont gardés pour la session.
  const [searchParams] = useSearchParams();
  const [initial] = useState(() => resolveInitialListState(readListMemory(), searchParams.get('activity') ?? ''));
  const [list, setList] = useState<ListState>(initial.state);
  const [isPickerOpen, setIsPickerOpen] = useState(initial.showPicker);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast, showToast, closeToast } = useToast();
  useFlashToast(showToast);
  const { filters, sortKey, sortDirection, pageSize } = list;
  const deferredSearch = useDeferredValue(filters.search);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const [data, acts] = await Promise.all([getRegistrations(), getActivities(true)]);
      setRegistrations(data);
      setActivities(acts);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!isPickerOpen) writeListMemory(list);
  }, [list, isPickerOpen]);

  const activitiesById = useMemo(
    () => Object.fromEntries(activities.map(a => [a.id, a])) as Record<string, Activity>,
    [activities]
  );

  const filteredRegistrations = useMemo(
    () => applyFilters(registrations, { ...filters, search: deferredSearch }, sortKey, sortDirection),
    [registrations, filters, deferredSearch, sortKey, sortDirection]
  );

  // Toute modification de filtre, de tri ou de taille de page revient à la page 1.
  const setFilter = (key: keyof ListFilters, value: string) =>
    setList(prev => ({ ...prev, filters: { ...prev.filters, [key]: value }, page: 1 }));
  const clearFilters = () => setList(prev => ({ ...prev, filters: { ...EMPTY_FILTERS, activity: prev.filters.activity }, page: 1 }));
  const setPage = (page: number) => setList(prev => ({ ...prev, page }));
  const setPageSize = (size: number) => setList(prev => ({ ...prev, pageSize: size, page: 1 }));

  const handleSelectActivity = (id: string) => {
    setList(defaultListState(id));
    setIsPickerOpen(false);
  };

  const toggleSort = (key: SortKey) =>
    setList(prev => ({
      ...prev,
      sortKey: key,
      sortDirection: prev.sortKey === key && prev.sortDirection === 'asc' ? 'desc' : 'asc',
      page: 1,
    }));

  const handleExport = () => {
    if (filteredRegistrations.length === 0) return;
    try {
      exportToExcel(filteredRegistrations, activities, buildExportFilename(filters, activitiesById[filters.activity]));
    } catch (err) {
      showToast('error', errorMessage(err, 'L\'export Excel a échoué.'));
    }
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    setIsDeleting(true);
    try {
      await deleteRegistration(deleteTargetId);
      setRegistrations(prev => prev.filter(reg => reg.id !== deleteTargetId));
      showToast('success', 'Inscription supprimée.');
    } catch (err) {
      showToast('error', errorMessage(err, 'Erreur lors de la suppression.'));
    } finally {
      setIsDeleting(false);
      setDeleteTargetId(null);
    }
  };

  if (isLoading) return <RegistrationListSkeleton />;
  if (loadError) {
    return <LoadError message="Impossible de charger les inscriptions." onRetry={() => void load()} />;
  }

  if (isPickerOpen && registrations.length > 0) {
    return <ActivityPicker activities={activities} registrations={registrations} onSelect={handleSelectActivity} />;
  }

  const hasFilters = Boolean(filters.search || filters.payment || filters.dateFrom || filters.dateTo);
  const totalPages = Math.max(1, Math.ceil(filteredRegistrations.length / pageSize));
  const safePage = Math.min(list.page, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredRegistrations.length);
  const selectedActivity = activitiesById[filters.activity];

  return (
    <div className="h-full flex flex-col">
      <RegistrationStatsStrip rows={filteredRegistrations} />

      <div className="toolbar flex-wrap gap-y-2">
        <button type="button" onClick={() => setIsPickerOpen(true)} className="btn btn-default btn-sm">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Changer de liste
        </button>
        <div className="inline-flex items-center gap-1.5 px-2 min-h-8 rounded-control bg-gray-100 text-sm text-ink max-w-[220px]" aria-live="polite">
          {filters.activity ? (
            <>
              <span className="h-2.5 w-2.5 rounded-full flex-shrink-0 border border-gray-500" style={{ backgroundColor: selectedActivity?.color ?? '#9CA3AF' }} aria-hidden="true" />
              <span className="truncate font-semibold">{selectedActivity?.name ?? 'Activité supprimée'}</span>
            </>
          ) : (
            <>
              <Layers className="h-4 w-4 text-ink-muted flex-shrink-0" aria-hidden="true" />
              <span className="truncate font-semibold">Toutes les activités</span>
            </>
          )}
        </div>

        <div className="relative">
          <label htmlFor="list-search" className="sr-only">Rechercher par nom, prénom ou téléphone</label>
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" aria-hidden="true" />
          <input
            id="list-search"
            type="search"
            placeholder="Nom, prénom ou téléphone"
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            className="input-field h-8 pl-8 w-72"
          />
        </div>

        <select
          value={filters.payment}
          onChange={(e) => setFilter('payment', e.target.value)}
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
          <input type="date" value={filters.dateFrom} onChange={(e) => setFilter('dateFrom', e.target.value)}
            max={filters.dateTo || undefined} aria-label="Date de début" className="input-field w-auto h-8 py-0" />
        </label>
        <label className="flex items-center gap-1 text-sm text-ink-soft">
          Au
          <input type="date" value={filters.dateTo} onChange={(e) => setFilter('dateTo', e.target.value)}
            min={filters.dateFrom || undefined} aria-label="Date de fin" className="input-field w-auto h-8 py-0" />
        </label>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-ink-muted tabular-nums">
            {filteredRegistrations.length} / {registrations.length} inscription(s)
          </span>
          <button
            type="button"
            onClick={handleExport}
            disabled={filteredRegistrations.length === 0}
            className="btn btn-success btn-sm disabled:opacity-50 disabled:pointer-events-none"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Exporter Excel
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {filteredRegistrations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64">
            <ClipboardList className="h-10 w-10 mb-3 text-ink-muted" aria-hidden="true" />
            <p className="text-sm font-semibold text-ink-soft">
              {hasFilters ? 'Aucun résultat pour ces filtres' : 'Aucune inscription pour le moment'}
            </p>
            {hasFilters ? (
              <button type="button" onClick={clearFilters} className="mt-3 btn btn-default btn-sm">
                Effacer les filtres
              </button>
            ) : (
              <Link to={filters.activity ? `/add?activity=${encodeURIComponent(filters.activity)}` : '/add'} className="mt-3 btn btn-primary btn-sm">
                <PlusCircle className="h-4 w-4" aria-hidden="true" />
                Nouvelle inscription
              </Link>
            )}
          </div>
        ) : (
          <RegistrationTable
            rows={filteredRegistrations.slice(startIndex, endIndex)}
            activitiesById={activitiesById}
            sortKey={sortKey}
            sortDirection={sortDirection}
            onToggleSort={toggleSort}
            onDelete={setDeleteTargetId}
          />
        )}
      </div>

      {filteredRegistrations.length > 0 && (
        <PaginationBar
          page={safePage}
          totalPages={totalPages}
          startIndex={startIndex}
          endIndex={endIndex}
          total={filteredRegistrations.length}
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          onPageChange={setPage}
        />
      )}

      <ConfirmModal
        open={deleteTargetId !== null}
        title="Supprimer l'inscription"
        message="Cette inscription sera définitivement supprimée. Cette action est irréversible."
        confirmLabel="Supprimer"
        busyLabel="Suppression..."
        busy={isDeleting}
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTargetId(null)}
      />

      <Toast open={toast.open} variant={toast.variant} message={toast.message} onClose={closeToast} />
    </div>
  );
};

export default RegistrationList;
