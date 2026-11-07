import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { getRegistrations, deleteRegistration } from '../utils/storage';
import { exportToExcel } from '../utils/excelExport';
import { exportDatabase, importDatabase } from '../utils/dbBackup';
import { getActivities } from '../utils/activities';
import { Registration, Activity } from '../types';
import ConfirmModal from './ConfirmModal';
import Toast, { ToastVariant } from './Toast';
import {
  Download,
  Search,
  Trash2,
  Save,
  Upload,
  Pencil,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  PlusCircle,
  ArrowLeft,
  Layers,
  CalendarDays,
  Users,
} from 'lucide-react';

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

type SortKey = 'name' | 'date' | 'amount' | 'payment';
type SortDirection = 'asc' | 'desc';

const formatAmount = (amount: number): string =>
  `${new Intl.NumberFormat('fr-FR').format(amount)} F`;

const PAYMENT_LABEL: Record<Registration['paymentType'], string> = {
  wave: 'Wave',
  cash: 'Espèce',
  orange_money: 'Orange Money',
};

const PAYMENT_BADGE_CLASS: Record<Registration['paymentType'], string> = {
  wave: 'bg-blue-100 text-blue-700',
  cash: 'bg-emerald-100 text-emerald-700',
  orange_money: 'bg-orange-100 text-orange-700',
};

const compareRegistrations = (
  a: Registration,
  b: Registration,
  key: SortKey
): number => {
  switch (key) {
    case 'name': {
      const an = `${a.lastName} ${a.firstName}`.toLowerCase();
      const bn = `${b.lastName} ${b.firstName}`.toLowerCase();
      return an.localeCompare(bn, 'fr');
    }
    case 'date':
      return a.registrationDate.localeCompare(b.registrationDate);
    case 'amount':
      return a.amount - b.amount;
    case 'payment':
      return a.paymentType.localeCompare(b.paymentType);
  }
};

const RegistrationList: React.FC = () => {
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [filteredRegistrations, setFilteredRegistrations] = useState<Registration[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPayment, setFilterPayment] = useState('');
  const [filterActivity, setFilterActivity] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [selectionMade, setSelectionMade] = useState(false);
  const [toast, setToast] = useState<{ open: boolean; variant: ToastVariant; message: string }>({
    open: false,
    variant: 'success',
    message: '',
  });

  const showToast = (variant: ToastVariant, message: string) =>
    setToast({ open: true, variant, message });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterPayment, filterActivity, filterDateFrom, filterDateTo, sortKey, sortDirection, pageSize]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [data, acts] = await Promise.all([getRegistrations(), getActivities(true)]);
        if (cancelled) return;
        setRegistrations(data);
        setFilteredRegistrations(data);
        setActivities(acts);
      } catch (error) {
        console.error('Error loading registrations or activities:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const activitiesById = useMemo(() => {
    const map: Record<string, Activity> = {};
    for (const a of activities) map[a.id] = a;
    return map;
  }, [activities]);

  const activityStats = useMemo(() => {
    const map: Record<string, { count: number; amount: number }> = {};
    for (const r of registrations) {
      const cur = map[r.activityId] ?? { count: 0, amount: 0 };
      map[r.activityId] = { count: cur.count + 1, amount: cur.amount + r.amount };
    }
    return map;
  }, [registrations]);

  const handleSelectActivity = (id: string) => {
    setFilterActivity(id);
    setSearchTerm('');
    setFilterPayment('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSortKey(null);
    setSelectionMade(true);
  };

  const handleChangeSelection = () => {
    setSelectionMade(false);
  };

  useEffect(() => {
    applyFilters();
  }, [searchTerm, filterPayment, filterActivity, filterDateFrom, filterDateTo, registrations, sortKey, sortDirection]);

  const applyFilters = () => {
    let filtered = [...registrations];

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(reg =>
        reg.firstName.toLowerCase().includes(term) ||
        reg.lastName.toLowerCase().includes(term) ||
        reg.phone.toLowerCase().includes(term) ||
        reg.address.toLowerCase().includes(term)
      );
    }

    if (filterPayment) {
      filtered = filtered.filter(reg => reg.paymentType === filterPayment);
    }

    if (filterActivity) {
      filtered = filtered.filter(reg => reg.activityId === filterActivity);
    }

    if (filterDateFrom) {
      filtered = filtered.filter(reg => reg.registrationDate >= filterDateFrom);
    }

    if (filterDateTo) {
      filtered = filtered.filter(reg => reg.registrationDate <= filterDateTo);
    }

    if (sortKey) {
      const dir = sortDirection === 'asc' ? 1 : -1;
      filtered.sort((a, b) => compareRegistrations(a, b, sortKey) * dir);
    }

    setFilteredRegistrations(filtered);
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('asc');
    }
  };

  const SortIcon: React.FC<{ column: SortKey }> = ({ column }) => {
    if (sortKey !== column) {
      return <ChevronsUpDown className="h-3 w-3 ml-0.5 text-gray-400" aria-hidden="true" />;
    }
    return sortDirection === 'asc' ? (
      <ChevronUp className="h-3 w-3 ml-0.5 text-gray-700" aria-hidden="true" />
    ) : (
      <ChevronDown className="h-3 w-3 ml-0.5 text-gray-700" aria-hidden="true" />
    );
  };

  const ariaSortFor = (column: SortKey): 'ascending' | 'descending' | 'none' => {
    if (sortKey !== column) return 'none';
    return sortDirection === 'asc' ? 'ascending' : 'descending';
  };

  const handleExport = () => {
    if (filteredRegistrations.length === 0) return;

    const slugify = (s: string) =>
      s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');

    const parts: string[] = [];
    if (filterActivity) {
      const a = activitiesById[filterActivity];
      if (a) parts.push(slugify(a.name));
    } else {
      parts.push('inscriptions');
    }
    if (filterDateFrom && filterDateTo) {
      parts.push(`${filterDateFrom}_au_${filterDateTo}`);
    } else if (filterDateFrom) {
      parts.push(`depuis_${filterDateFrom}`);
    } else if (filterDateTo) {
      parts.push(`jusqu_${filterDateTo}`);
    } else {
      parts.push(new Date().toISOString().split('T')[0]);
    }
    const filename = parts.filter(Boolean).join('_');

    exportToExcel(filteredRegistrations, activities, filename);
  };

  const confirmDelete = async () => {
    if (!deleteTargetId) return;
    try {
      await deleteRegistration(deleteTargetId);
      setRegistrations(prev => prev.filter(reg => reg.id !== deleteTargetId));
      showToast('success', 'Inscription supprimee.');
    } catch (error) {
      console.error('Error deleting registration:', error);
      showToast('error', 'Erreur lors de la suppression.');
    } finally {
      setDeleteTargetId(null);
    }
  };

  const handleBackup = async () => {
    try {
      const ok = await exportDatabase();
      if (ok) showToast('success', 'Base de donnees sauvegardee.');
    } catch (error) {
      console.error('Error exporting database:', error);
      showToast('error', 'Erreur lors de la sauvegarde.');
    }
  };

  const confirmRestore = async () => {
    setRestoreOpen(false);
    try {
      const ok = await importDatabase();
      if (ok) {
        showToast('success', 'Base restauree. Redemarrage...');
        setTimeout(() => window.location.reload(), 1200);
      }
    } catch (error) {
      console.error('Error importing database:', error);
      showToast('error', 'Erreur lors de la restauration.');
    }
  };

  const stats = useMemo(() => {
    const source = filteredRegistrations;
    const wave = source.filter(r => r.paymentType === 'wave');
    const cash = source.filter(r => r.paymentType === 'cash');
    const orange = source.filter(r => r.paymentType === 'orange_money');
    const sum = (rs: Registration[]) => rs.reduce((acc, r) => acc + r.amount, 0);
    return {
      total: source.length,
      totalAmount: sum(source),
      waveCount: wave.length,
      waveAmount: sum(wave),
      cashCount: cash.length,
      cashAmount: sum(cash),
      orangeCount: orange.length,
      orangeAmount: sum(orange),
    };
  }, [filteredRegistrations]);

  const totalPages = Math.max(1, Math.ceil(filteredRegistrations.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, filteredRegistrations.length);
  const paginatedRegistrations = filteredRegistrations.slice(startIndex, endIndex);

  if (isLoading) {
    return (
      <div className="h-full flex flex-col" aria-busy="true" aria-live="polite">
        {/* Stats strip skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 px-3 py-2 border-b border-gray-200 bg-white">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="panel px-3 py-2">
              <div className="skeleton h-2.5 w-16 rounded mb-1.5" />
              <div className="skeleton h-4 w-20 rounded" />
            </div>
          ))}
        </div>

        {/* Toolbar skeleton */}
        <div className="toolbar">
          <div className="skeleton h-7 w-48 rounded" />
          <div className="skeleton h-7 w-36 rounded" />
          <div className="skeleton h-7 w-32 rounded" />
          <div className="skeleton h-7 w-20 rounded ml-2" />
          <div className="skeleton h-7 w-28 rounded" />
        </div>

        {/* Table skeleton */}
        <div className="flex-1 overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {Array.from({ length: 7 }).map((_, i) => (
                  <th key={i} className="px-3 py-2">
                    <div className="skeleton h-3 w-16 rounded" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-3 py-2.5">
                      <div className="skeleton h-3 rounded" style={{ width: `${50 + ((i * 7 + j) % 5) * 10}%` }} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <span className="sr-only">Chargement des inscriptions...</span>
      </div>
    );
  }

  if (!selectionMade && registrations.length > 0) {
    const activeActivities = activities.filter(a => !a.archivedAt);
    const archivedActivities = activities.filter(a => a.archivedAt);

    const renderActivityCard = (a: Activity) => {
      const s = activityStats[a.id] ?? { count: 0, amount: 0 };
      const isArchived = !!a.archivedAt;
      return (
        <button
          key={a.id}
          type="button"
          onClick={() => handleSelectActivity(a.id)}
          className={`panel p-4 text-left hover:border-blue-400 hover:shadow-sm transition-all duration-100 group ${
            isArchived ? 'opacity-70' : ''
          }`}
        >
          <div className="flex items-start gap-2 mb-2">
            <span
              className="h-3 w-3 rounded-full flex-shrink-0 mt-1"
              style={{ backgroundColor: a.color }}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-gray-900 truncate group-hover:text-blue-700">
                {a.name}
              </h3>
              {isArchived && (
                <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500">
                  Archivée
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1 text-gray-600">
              <Users className="h-3 w-3" />
              <span className="tabular-nums font-medium">{s.count}</span>
              <span className="text-gray-500">inscription{s.count > 1 ? 's' : ''}</span>
            </span>
            <span className="text-gray-700 font-medium tabular-nums">
              {formatAmount(s.amount)}
            </span>
          </div>
          {a.eventDate && (
            <div className="mt-1.5 text-[11px] text-gray-500 inline-flex items-center gap-1">
              <CalendarDays className="h-3 w-3" />
              {new Date(a.eventDate).toLocaleDateString('fr-FR')}
            </div>
          )}
        </button>
      );
    };

    return (
      <div className="p-6 max-w-5xl">
        <div className="mb-4">
          <h2 className="text-sm font-semibold text-gray-800 mb-1">
            Sélectionnez une liste à consulter
          </h2>
          <p className="text-xs text-gray-500">
            Choisissez une activité pour afficher ses inscriptions, ou consultez toutes les inscriptions.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* All registrations */}
          <button
            type="button"
            onClick={() => handleSelectActivity('')}
            className="panel p-4 text-left hover:border-blue-400 hover:shadow-sm transition-all duration-100 group border-l-2 border-l-blue-400"
          >
            <div className="flex items-start gap-2 mb-2">
              <Layers className="h-3.5 w-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-gray-900 group-hover:text-blue-700">
                  Toutes les inscriptions
                </h3>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Vue globale, toutes activités confondues
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="inline-flex items-center gap-1 text-gray-600">
                <Users className="h-3 w-3" />
                <span className="tabular-nums font-medium">{stats.total}</span>
                <span className="text-gray-500">inscription{stats.total > 1 ? 's' : ''}</span>
              </span>
              <span className="text-gray-700 font-medium tabular-nums">
                {formatAmount(stats.totalAmount)}
              </span>
            </div>
          </button>

          {activeActivities.map(renderActivityCard)}
        </div>

        {archivedActivities.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
              Archivées ({archivedActivities.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {archivedActivities.map(renderActivityCard)}
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Stats strip */}
      {stats.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 px-3 py-2 border-b border-gray-200 bg-white">
          <div className="panel px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Inscriptions</div>
            <div className="text-base font-semibold text-gray-900 tabular-nums mt-0.5">{stats.total}</div>
          </div>
          <div className="panel px-3 py-2">
            <div className="text-[10px] font-medium uppercase tracking-wider text-gray-500">Montant total</div>
            <div className="text-base font-semibold text-gray-900 tabular-nums mt-0.5">{formatAmount(stats.totalAmount)}</div>
          </div>
          <div className="panel px-3 py-2 border-l-2 border-l-blue-400">
            <div className="text-[10px] font-medium uppercase tracking-wider text-blue-700">Wave</div>
            <div className="text-base font-semibold text-gray-900 tabular-nums mt-0.5">
              {stats.waveCount} <span className="text-xs font-normal text-gray-500">· {formatAmount(stats.waveAmount)}</span>
            </div>
          </div>
          <div className="panel px-3 py-2 border-l-2 border-l-orange-400">
            <div className="text-[10px] font-medium uppercase tracking-wider text-orange-700">Orange Money</div>
            <div className="text-base font-semibold text-gray-900 tabular-nums mt-0.5">
              {stats.orangeCount} <span className="text-xs font-normal text-gray-500">· {formatAmount(stats.orangeAmount)}</span>
            </div>
          </div>
          <div className="panel px-3 py-2 border-l-2 border-l-emerald-400">
            <div className="text-[10px] font-medium uppercase tracking-wider text-emerald-700">Espèce</div>
            <div className="text-base font-semibold text-gray-900 tabular-nums mt-0.5">
              {stats.cashCount} <span className="text-xs font-normal text-gray-500">· {formatAmount(stats.cashAmount)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="toolbar flex-wrap">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Rechercher..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-field pl-7 w-48 py-1"
          />
        </div>

        {/* Current selection + change button */}
        <button
          type="button"
          onClick={handleChangeSelection}
          className="btn btn-default"
          title="Choisir une autre liste"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Changer
        </button>
        <div
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-gray-100 text-xs text-gray-700 max-w-[220px]"
          aria-live="polite"
        >
          {filterActivity ? (
            <>
              <span
                className="h-2 w-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: activitiesById[filterActivity]?.color ?? '#94a3b8' }}
              />
              <span className="truncate font-medium">
                {activitiesById[filterActivity]?.name ?? 'Activité supprimée'}
              </span>
            </>
          ) : (
            <>
              <Layers className="h-3 w-3 text-gray-500 flex-shrink-0" />
              <span className="truncate font-medium">Toutes les activités</span>
            </>
          )}
        </div>

        {/* Payment filter */}
        <select
          value={filterPayment}
          onChange={(e) => setFilterPayment(e.target.value)}
          className="input-field w-auto py-1"
        >
          <option value="">Tous les paiements</option>
          <option value="cash">Espèce</option>
          <option value="wave">Wave</option>
          <option value="orange_money">Orange Money</option>
        </select>

        {/* Date range */}
        <label className="flex items-center gap-1 text-xs text-gray-600">
          Du
          <input
            type="date"
            value={filterDateFrom}
            onChange={(e) => setFilterDateFrom(e.target.value)}
            max={filterDateTo || undefined}
            aria-label="Date de début"
            className="input-field w-auto py-1"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-gray-600">
          Au
          <input
            type="date"
            value={filterDateTo}
            onChange={(e) => setFilterDateTo(e.target.value)}
            min={filterDateFrom || undefined}
            aria-label="Date de fin"
            className="input-field w-auto py-1"
          />
        </label>

        <div className="h-4 w-px bg-gray-300 mx-1"></div>

        {/* Actions */}
        <button
          onClick={handleExport}
          disabled={filteredRegistrations.length === 0}
          className={`btn btn-success ${filteredRegistrations.length === 0 ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <Download className="h-3.5 w-3.5" />
          Excel
        </button>

        <button onClick={handleBackup} className="btn btn-default">
          <Save className="h-3.5 w-3.5" />
          Sauvegarder
        </button>

        <button onClick={() => setRestoreOpen(true)} className="btn btn-warning">
          <Upload className="h-3.5 w-3.5" />
          Restaurer
        </button>

        {/* Count */}
        <span className="ml-auto text-xs text-gray-500">
          {filteredRegistrations.length} / {registrations.length} inscription(s)
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {filteredRegistrations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-400">
            <ClipboardList className="h-10 w-10 mb-3 text-gray-300" />
            <p className="text-sm font-medium text-gray-500">
              {(searchTerm || filterPayment || filterActivity || filterDateFrom || filterDateTo)
                ? 'Aucun resultat pour ces filtres'
                : 'Aucune inscription pour le moment'}
            </p>
            {(searchTerm || filterPayment || filterActivity || filterDateFrom || filterDateTo) ? (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setFilterPayment('');
                  setFilterActivity('');
                  setFilterDateFrom('');
                  setFilterDateTo('');
                }}
                className="mt-3 btn btn-default"
              >
                Effacer les filtres
              </button>
            ) : (
              <a href="/add" className="mt-3 btn btn-primary">
                <PlusCircle className="h-3.5 w-3.5" />
                Nouvelle inscription
              </a>
            )}
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th aria-sort={ariaSortFor('name')} className="text-left px-3 py-2 font-medium text-gray-600">
                  <button
                    type="button"
                    onClick={() => toggleSort('name')}
                    className="inline-flex items-center hover:text-gray-900"
                  >
                    Inscrit <SortIcon column="name" />
                  </button>
                </th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Activité</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Adresse</th>
                <th aria-sort={ariaSortFor('date')} className="text-left px-3 py-2 font-medium text-gray-600">
                  <button
                    type="button"
                    onClick={() => toggleSort('date')}
                    className="inline-flex items-center hover:text-gray-900"
                  >
                    Date <SortIcon column="date" />
                  </button>
                </th>
                <th aria-sort={ariaSortFor('amount')} className="text-right px-3 py-2 font-medium text-gray-600">
                  <button
                    type="button"
                    onClick={() => toggleSort('amount')}
                    className="inline-flex items-center hover:text-gray-900"
                  >
                    Montant <SortIcon column="amount" />
                  </button>
                </th>
                <th aria-sort={ariaSortFor('payment')} className="text-left px-3 py-2 font-medium text-gray-600">
                  <button
                    type="button"
                    onClick={() => toggleSort('payment')}
                    className="inline-flex items-center hover:text-gray-900"
                  >
                    Paiement <SortIcon column="payment" />
                  </button>
                </th>
                <th className="text-center px-3 py-2 font-medium text-gray-600 w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedRegistrations.map(registration => (
                <tr key={registration.id} className="hover:bg-blue-50/50 transition-colors duration-75">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">
                      {registration.lastName} {registration.firstName}
                    </div>
                    <div className="text-gray-500">{registration.phone}</div>
                  </td>
                  <td className="px-3 py-2">
                    {(() => {
                      const a = activitiesById[registration.activityId];
                      if (!a) return <span className="text-gray-400">—</span>;
                      return (
                        <span className="inline-flex items-center gap-1.5 max-w-[160px]">
                          <span
                            className="h-2 w-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: a.color }}
                          />
                          <span className="truncate text-gray-700" title={a.name}>{a.name}</span>
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    <div className="truncate max-w-[180px]" title={registration.address}>
                      {registration.address}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-gray-700 tabular-nums whitespace-nowrap">
                    {new Date(registration.registrationDate).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-3 py-2 text-right font-medium text-gray-900 tabular-nums whitespace-nowrap">
                    {formatAmount(registration.amount)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${PAYMENT_BADGE_CLASS[registration.paymentType]}`}>
                      {PAYMENT_LABEL[registration.paymentType]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-center gap-1">
                      <Link
                        to={`/edit/${registration.id}`}
                        aria-label={`Modifier l'inscription de ${registration.lastName} ${registration.firstName}`}
                        title="Modifier"
                        className="p-1.5 rounded hover:bg-blue-100 text-blue-600 transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Link>
                      <button
                        onClick={() => setDeleteTargetId(registration.id)}
                        aria-label={`Supprimer l'inscription de ${registration.lastName} ${registration.firstName}`}
                        title="Supprimer"
                        className="p-1.5 rounded hover:bg-red-100 text-red-600 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination bar */}
      {filteredRegistrations.length > 0 && (
        <div className="flex items-center justify-between px-3 py-2 border-t border-gray-200 bg-gray-50 text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <span>Lignes par page:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="input-field w-auto py-0.5 px-1.5 text-xs"
            >
              {PAGE_SIZE_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <span>{startIndex + 1}-{endIndex} sur {filteredRegistrations.length}</span>
            <div className="flex items-center gap-0.5">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                aria-label="Page précédente"
                title="Page précédente"
                className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:pointer-events-none"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                aria-label="Page suivante"
                title="Page suivante"
                className="p-1.5 rounded hover:bg-gray-200 disabled:opacity-30 disabled:pointer-events-none"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={deleteTargetId !== null}
        title="Supprimer l'inscription"
        message="Cette inscription sera definitivement supprimee. Cette action est irreversible."
        confirmLabel="Supprimer"
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTargetId(null)}
      />

      <ConfirmModal
        open={restoreOpen}
        title="Restaurer la base de donnees"
        message="Toutes les inscriptions actuelles seront remplacees par celles du fichier importe. Continuer ?"
        confirmLabel="Restaurer"
        variant="danger"
        onConfirm={confirmRestore}
        onCancel={() => setRestoreOpen(false)}
      />

      <Toast
        open={toast.open}
        variant={toast.variant}
        message={toast.message}
        onClose={() => setToast(t => ({ ...t, open: false }))}
      />
    </div>
  );
};

export default RegistrationList;
