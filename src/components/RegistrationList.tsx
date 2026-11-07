import React, { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Download, Search, ClipboardList, PlusCircle, ArrowLeft, Layers } from 'lucide-react';
import { getRegistrations, deleteRegistration } from '../utils/storage';
import { exportToExcel } from '../utils/excelExport';
import { getActivities } from '../utils/activities';
import { todayLocalIso } from '../utils/dates';
import { Registration, Activity } from '../types';
import ConfirmModal from './ConfirmModal';
import Toast from './Toast';
import LoadError from './LoadError';
import RegistrationTable, { PaginationBar, SortKey, SortDirection } from './RegistrationTable';
import { ActivityPicker, RegistrationListSkeleton, RegistrationStatsStrip } from './RegistrationListParts';
import { useToast } from './useToast';
import { useFlashToast } from './useFlashToast';
import { errorMessage } from './uiFormat';
import { PAYMENT_METAS } from './paymentMeta';

const DEFAULT_PAGE_SIZE = 25;

const slugify = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');

const compareRegistrations = (a: Registration, b: Registration, key: SortKey): number => {
  switch (key) {
    case 'name':
      return `${a.lastName} ${a.firstName}`.toLowerCase().localeCompare(`${b.lastName} ${b.firstName}`.toLowerCase(), 'fr');
    case 'date':
      return a.registrationDate.localeCompare(b.registrationDate);
    case 'amount':
      return a.amount - b.amount;
    case 'payment':
      return a.paymentType.localeCompare(b.paymentType);
  }
};

interface Filters {
  search: string;
  payment: string;
  activity: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: Filters = { search: '', payment: '', activity: '', dateFrom: '', dateTo: '' };

const applyFilters = (rows: Registration[], f: Filters, sortKey: SortKey | null, dir: SortDirection): Registration[] => {
  const term = f.search.toLowerCase();
  const filtered = rows.filter(r =>
    (!term || [r.firstName, r.lastName, r.phone, r.address].some(v => v.toLowerCase().includes(term))) &&
    (!f.payment || r.paymentType === f.payment) &&
    (!f.activity || r.activityId === f.activity) &&
    (!f.dateFrom || r.registrationDate >= f.dateFrom) &&
    (!f.dateTo || r.registrationDate <= f.dateTo)
  );
  if (!sortKey) return filtered;
  const sign = dir === 'asc' ? 1 : -1;
  return [...filtered].sort((a, b) => compareRegistrations(a, b, sortKey) * sign);
};

const buildExportFilename = (f: Filters, activity: Activity | undefined): string => {
  const parts = [f.activity ? (activity ? slugify(activity.name) : '') : 'inscriptions'];
  if (f.dateFrom && f.dateTo) parts.push(`${f.dateFrom}_au_${f.dateTo}`);
  else if (f.dateFrom) parts.push(`depuis_${f.dateFrom}`);
  else if (f.dateTo) parts.push(`jusqu_${f.dateTo}`);
  else parts.push(todayLocalIso());
  return parts.filter(Boolean).join('_');
};

const RegistrationList: React.FC = () => {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  // « Voir la liste » depuis la saisie ouvre directement la liste de l'activité (Lot 1).
  const [searchParams] = useSearchParams();
  const requestedActivity = searchParams.get('activity') ?? '';
  const [filters, setFilters] = useState<Filters>(() => ({ ...EMPTY_FILTERS, activity: requestedActivity }));
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectionMade, setSelectionMade] = useState(Boolean(requestedActivity));
  const { toast, showToast, closeToast } = useToast();
  useFlashToast(showToast);
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
    setCurrentPage(1);
  }, [filters, sortKey, sortDirection, pageSize]);

  const activitiesById = useMemo(
    () => Object.fromEntries(activities.map(a => [a.id, a])) as Record<string, Activity>,
    [activities]
  );

  const filteredRegistrations = useMemo(
    () => applyFilters(registrations, { ...filters, search: deferredSearch }, sortKey, sortDirection),
    [registrations, filters, deferredSearch, sortKey, sortDirection]
  );

  const setFilter = (key: keyof Filters, value: string) => setFilters(prev => ({ ...prev, [key]: value }));

  const handleSelectActivity = (id: string) => {
    setFilters({ ...EMPTY_FILTERS, activity: id });
    setSortKey(null);
    setSelectionMade(true);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection('asc');
  };

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

  if (!selectionMade && registrations.length > 0) {
    return <ActivityPicker activities={activities} registrations={registrations} onSelect={handleSelectActivity} />;
  }

  const hasFilters = Object.values(filters).some(Boolean);
  const totalPages = Math.max(1, Math.ceil(filteredRegistrations.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredRegistrations.length);
  const selectedActivity = activitiesById[filters.activity];

  return (
    <div className="h-full flex flex-col">
      <RegistrationStatsStrip rows={filteredRegistrations} />

      <div className="toolbar flex-wrap">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
          <input
            type="search"
            placeholder="Rechercher..."
            aria-label="Rechercher une inscription"
            value={filters.search}
            onChange={(e) => setFilter('search', e.target.value)}
            className="input-field pl-7 w-48 py-1"
          />
        </div>

        <button type="button" onClick={() => setSelectionMade(false)} className="btn btn-default" title="Choisir une autre liste">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Changer
        </button>
        <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-gray-100 text-xs text-gray-700 max-w-[220px]" aria-live="polite">
          {filters.activity ? (
            <>
              <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: selectedActivity?.color ?? '#94a3b8' }} aria-hidden="true" />
              <span className="truncate font-medium">{selectedActivity?.name ?? 'Activité supprimée'}</span>
            </>
          ) : (
            <>
              <Layers className="h-3 w-3 text-gray-600 flex-shrink-0" aria-hidden="true" />
              <span className="truncate font-medium">Toutes les activités</span>
            </>
          )}
        </div>

        <select
          value={filters.payment}
          onChange={(e) => setFilter('payment', e.target.value)}
          aria-label="Filtrer par paiement"
          className="input-field w-auto py-1"
        >
          <option value="">Tous les paiements</option>
          {PAYMENT_METAS.map(m => (
            <option key={m.type} value={m.type}>{m.label}</option>
          ))}
        </select>

        <label className="flex items-center gap-1 text-xs text-gray-700">
          Du
          <input type="date" value={filters.dateFrom} onChange={(e) => setFilter('dateFrom', e.target.value)}
            max={filters.dateTo || undefined} aria-label="Date de début" className="input-field w-auto py-1" />
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-700">
          Au
          <input type="date" value={filters.dateTo} onChange={(e) => setFilter('dateTo', e.target.value)}
            min={filters.dateFrom || undefined} aria-label="Date de fin" className="input-field w-auto py-1" />
        </label>

        <div className="h-4 w-px bg-gray-300 mx-1" aria-hidden="true"></div>

        <button
          onClick={handleExport}
          disabled={filteredRegistrations.length === 0}
          className="btn btn-success disabled:opacity-50 disabled:pointer-events-none"
        >
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Excel
        </button>

        <span className="ml-auto text-xs text-gray-600">
          {filteredRegistrations.length} / {registrations.length} inscription(s)
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        {filteredRegistrations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <ClipboardList className="h-10 w-10 mb-3 text-gray-300" aria-hidden="true" />
            <p className="text-sm font-medium text-gray-600">
              {hasFilters ? 'Aucun résultat pour ces filtres' : 'Aucune inscription pour le moment'}
            </p>
            {hasFilters ? (
              <button onClick={() => setFilters(EMPTY_FILTERS)} className="mt-3 btn btn-default">
                Effacer les filtres
              </button>
            ) : (
              <Link to="/add" className="mt-3 btn btn-primary">
                <PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />
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
          onPageChange={setCurrentPage}
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
