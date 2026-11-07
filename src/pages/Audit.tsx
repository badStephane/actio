import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { History, Trash2, RefreshCw } from 'lucide-react';
import { AuditEvent, EntityType, EventType, getAuditEvents, clearAuditLog } from '../utils/audit';
import ConfirmModal from '../components/ConfirmModal';
import Toast from '../components/Toast';
import LoadError from '../components/LoadError';
import { useToast } from '../components/useToast';
import { errorMessage } from '../components/uiFormat';

const AUDIT_LIMIT = 500;

const EVENT_LABEL: Record<EventType, string> = {
  created: 'Créée',
  updated: 'Modifiée',
  deleted: 'Supprimée',
  archived: 'Archivée',
  unarchived: 'Réactivée',
  imported: 'Import',
  restored: 'Restauration',
  backup_exported: 'Sauvegarde',
  reset: 'Réinitialisation',
  password_changed: 'Mot de passe modifié',
  recovery_used: 'Code de récupération utilisé',
  audit_cleared: 'Historique effacé',
};

const EVENT_ORDER = Object.keys(EVENT_LABEL) as EventType[];

const EVENT_BADGE: Record<EventType, string> = {
  created: 'bg-emerald-100 text-emerald-700',
  updated: 'bg-brand-100 text-brand-700',
  deleted: 'bg-red-100 text-red-700',
  archived: 'bg-amber-100 text-amber-800',
  unarchived: 'bg-purple-100 text-purple-700',
  imported: 'bg-sky-100 text-sky-800',
  restored: 'bg-orange-100 text-orange-800',
  backup_exported: 'bg-slate-100 text-slate-700',
  reset: 'bg-red-100 text-red-800',
  password_changed: 'bg-indigo-100 text-indigo-700',
  recovery_used: 'bg-indigo-100 text-indigo-700',
  audit_cleared: 'bg-gray-200 text-gray-800',
};

const ENTITY_LABEL: Record<EntityType, string> = {
  registration: 'Inscription',
  activity: 'Activité',
  system: 'Système',
};

const formatDateTime = (ts: number): string =>
  new Date(ts).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const Audit: React.FC = () => {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filterEvent, setFilterEvent] = useState<EventType | ''>('');
  const [filterEntity, setFilterEntity] = useState<EntityType | ''>('');
  const [search, setSearch] = useState('');
  const [clearOpen, setClearOpen] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const { toast, showToast, closeToast } = useToast();

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      setEvents(await getAuditEvents(AUDIT_LIMIT));
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    let list = events;
    if (filterEvent) list = list.filter(e => e.eventType === filterEvent);
    if (filterEntity) list = list.filter(e => e.entityType === filterEntity);
    if (search.trim()) {
      const term = search.toLowerCase();
      list = list.filter(e => e.summary.toLowerCase().includes(term));
    }
    return list;
  }, [events, filterEvent, filterEntity, search]);

  const handleClear = async () => {
    setIsClearing(true);
    try {
      await clearAuditLog();
      showToast('success', 'Journal d\'historique effacé.');
      await load();
    } catch (error) {
      showToast('error', errorMessage(error, 'Erreur lors de la suppression.'));
    } finally {
      setIsClearing(false);
      setClearOpen(false);
    }
  };

  if (isLoading) {
    return (
      <div className="page h-full flex flex-col" aria-busy="true">
        <div className="toolbar border rounded-card">
          <div className="skeleton h-7 w-40 rounded" />
          <div className="skeleton h-7 w-32 rounded" />
          <div className="skeleton h-7 w-48 rounded" />
        </div>
        <div className="flex-1 overflow-hidden">
          <div className="space-y-2 p-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton h-10 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (loadError) {
    return <LoadError message="Impossible de charger l'historique." onRetry={() => void load()} />;
  }

  return (
    <div className="page h-full flex flex-col min-h-0">
      <section className="panel flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="toolbar flex-wrap rounded-t-card">
        <select
          value={filterEvent}
          onChange={(e) => setFilterEvent(e.target.value as EventType | '')}
          className="input-field w-auto h-8 py-0"
          aria-label="Filtrer par type d'événement"
        >
          <option value="">Tous les événements</option>
          {EVENT_ORDER.map(type => (
            <option key={type} value={type}>{EVENT_LABEL[type]}</option>
          ))}
        </select>

        <select
          value={filterEntity}
          onChange={(e) => setFilterEntity(e.target.value as EntityType | '')}
          className="input-field w-auto h-8 py-0"
          aria-label="Filtrer par ce que concerne l'événement"
        >
          <option value="">Concerne : tout</option>
          <option value="registration">Inscriptions</option>
          <option value="activity">Activités</option>
          <option value="system">Système</option>
        </select>

        <input
          type="text"
          placeholder="Rechercher dans les résumés..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="input-field w-64 h-8 py-0"
          aria-label="Rechercher dans l'historique"
        />

        <button type="button" onClick={() => void load()} className="btn btn-default btn-sm">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Recharger
        </button>

        <span className="text-sm text-ink-muted tabular-nums">
          {filtered.length} / {events.length} événement{events.length > 1 ? 's' : ''}
          {events.length >= AUDIT_LIMIT && ` (${AUDIT_LIMIT} derniers événements)`}
        </span>

        {/* U20 : action destructive séparée des filtres, poussée à droite, sans fond plein. */}
        <div className="ml-auto pl-3 border-l border-gray-300">
          <button
            type="button"
            onClick={() => setClearOpen(true)}
            disabled={events.length === 0}
            className="btn btn-danger-ghost btn-sm disabled:opacity-50 disabled:pointer-events-none"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            Effacer l'historique
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64">
            <History className="h-10 w-10 mb-3 text-ink-muted" aria-hidden="true" />
            <p className="text-sm font-semibold text-ink-soft">
              {events.length === 0 ? 'Aucun événement' : 'Aucun résultat pour ces filtres'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
              <tr>
                <th className="text-left px-3 py-2 font-semibold text-ink-soft w-44">Date</th>
                <th className="text-left px-3 py-2 font-semibold text-ink-soft w-32">Action</th>
                <th className="text-left px-3 py-2 font-semibold text-ink-soft w-28">Concerne</th>
                <th className="text-left px-3 py-2 font-semibold text-ink-soft">Détails</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(e => (
                <tr key={e.id} className="hover:bg-brand-50/50 transition-colors duration-75">
                  <td className="px-3 py-2 text-gray-700 tabular-nums whitespace-nowrap">
                    {formatDateTime(e.createdAt)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold ${EVENT_BADGE[e.eventType] ?? 'bg-gray-100 text-gray-700'}`}>
                      {EVENT_LABEL[e.eventType] ?? e.eventType}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-700 whitespace-nowrap">{ENTITY_LABEL[e.entityType] ?? e.entityType}</td>
                  <td className="px-3 py-2 text-gray-900">{e.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </section>

      <ConfirmModal
        open={clearOpen}
        title="Effacer le journal d'historique"
        message="Tous les événements enregistrés seront supprimés ; un événement « Historique effacé » sera conservé. Les inscriptions et activités ne seront pas affectées."
        confirmLabel="Tout effacer"
        busyLabel="Effacement..."
        busy={isClearing}
        variant="danger"
        onConfirm={handleClear}
        onCancel={() => setClearOpen(false)}
      />

      <Toast
        open={toast.open}
        variant={toast.variant}
        message={toast.message}
        onClose={closeToast}
      />
    </div>
  );
};

export default Audit;
