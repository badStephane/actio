import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardList, PlusCircle } from 'lucide-react';
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
import RegistrationListToolbar from './RegistrationListToolbar';
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement asynchrone au montage (état de chargement posé avant l'await), refonte notée hors 2.2.0
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
    <div className="page h-full flex flex-col gap-3 min-h-0">
      <RegistrationStatsStrip rows={filteredRegistrations} />

      <section className="panel flex-1 min-h-0 flex flex-col overflow-hidden">
      <RegistrationListToolbar
        filters={filters}
        selectedActivity={selectedActivity}
        shownCount={filteredRegistrations.length}
        totalCount={registrations.length}
        onChangeList={() => setIsPickerOpen(true)}
        onFilterChange={setFilter}
        onExport={handleExport}
      />

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
      </section>

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
