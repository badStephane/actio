import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, CalendarDays, Users, Lock, FileUp, Download, BarChart3 } from 'lucide-react';
import { Activity, DEFAULT_ACTIVITY_ID } from '../types';
import {
  getActivities,
  archiveActivity,
  unarchiveActivity,
  countRegistrationsByActivity,
  deleteActivity,
} from '../utils/activities';
import { getRegistrations } from '../utils/storage';
import { exportToExcel } from '../utils/excelExport';
import ActivityFormModal from '../components/ActivityFormModal';
import ConfirmModal from '../components/ConfirmModal';
import Toast from '../components/Toast';
import ImportRegistrationsModal from '../components/ImportRegistrationsModal';
import LoadError from '../components/LoadError';
import { useToast } from '../components/useToast';
import { errorMessage, formatAmount } from '../components/uiFormat';
import { todayLocalIso } from '../utils/dates';

const slugify = (s: string): string =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '');

const Activities: React.FC = () => {
  const navigate = useNavigate();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countsLoaded, setCountsLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<Activity | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<Activity | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Activity | null>(null);
  const [importTarget, setImportTarget] = useState<Activity | null>(null);
  const { toast, showToast, closeToast } = useToast();

  const loadActivities = useCallback(async () => {
    setLoadError(false);
    // M3 : tant que les compteurs ne sont pas connus, aucun bouton Supprimer.
    setCountsLoaded(false);
    try {
      const [list, byActivity] = await Promise.all([
        getActivities(true),
        countRegistrationsByActivity(),
      ]);
      setActivities(list);
      setCounts(byActivity);
      setCountsLoaded(true);
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  const handleNew = () => {
    setEditingActivity(null);
    setFormOpen(true);
  };

  const handleEdit = (activity: Activity) => {
    setEditingActivity(activity);
    setFormOpen(true);
  };

  const handleSaved = () => {
    setFormOpen(false);
    setEditingActivity(null);
    void loadActivities();
    showToast('success', 'Activité enregistrée.');
  };

  const confirmArchive = async () => {
    if (!archiveTarget) return;
    try {
      if (archiveTarget.archivedAt) {
        await unarchiveActivity(archiveTarget.id);
        showToast('success', 'Activité réactivée.');
      } else {
        await archiveActivity(archiveTarget.id);
        showToast('success', 'Activité archivée.');
      }
      await loadActivities();
    } catch (error) {
      showToast('error', errorMessage(error, 'Erreur lors de l\'opération.'));
    } finally {
      setArchiveTarget(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteActivity(deleteTarget.id);
      showToast('success', 'Activité supprimée.');
      await loadActivities();
    } catch (error) {
      // Ex. « Cette activité a encore des inscriptions : archivez-la plutôt. »
      showToast('error', errorMessage(error, 'Erreur lors de la suppression.'));
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleExportActivity = async (activity: Activity) => {
    try {
      const all = await getRegistrations();
      const forActivity = all.filter(r => r.activityId === activity.id);
      if (forActivity.length === 0) {
        showToast('error', `Aucune inscription pour « ${activity.name} ».`);
        return;
      }
      const filename = `${slugify(activity.name)}_${todayLocalIso()}`;
      exportToExcel(forActivity, activities, filename);
      showToast('success', `${forActivity.length} inscription${forActivity.length > 1 ? 's' : ''} exportée${forActivity.length > 1 ? 's' : ''}.`);
    } catch (error) {
      showToast('error', errorMessage(error, "Erreur lors de l'exportation."));
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64" aria-busy="true">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent" />
        <span className="sr-only">Chargement des activités...</span>
      </div>
    );
  }

  if (loadError) {
    return <LoadError message="Impossible de charger les activités." onRetry={() => void loadActivities()} />;
  }

  const active = activities.filter(a => !a.archivedAt);
  const archived = activities.filter(a => a.archivedAt);

  const renderRow = (a: Activity) => {
    const count = counts[a.id] ?? 0;
    const isDefault = a.id === DEFAULT_ACTIVITY_ID;
    const isArchived = !!a.archivedAt;
    // Une activité absente du GROUP BY n'a aucune inscription.
    const canDelete = !isDefault && countsLoaded && count === 0;
    return (
      <div
        key={a.id}
        className={`panel px-3 py-2.5 flex items-center gap-3 ${isArchived ? 'opacity-60' : ''}`}
      >
        <div
          className="h-3 w-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: a.color }}
          aria-label="Couleur"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-gray-900 truncate">{a.name}</h3>
            {isDefault && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wider text-gray-500">
                <Lock className="h-2.5 w-2.5" /> par défaut
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500 mt-0.5">
            {a.eventDate && (
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {new Date(a.eventDate).toLocaleDateString('fr-FR')}
              </span>
            )}
            {a.defaultAmount !== undefined && a.defaultAmount > 0 && (
              <span className="tabular-nums">{formatAmount(a.defaultAmount)}</span>
            )}
            <span className="inline-flex items-center gap-1">
              <Users className="h-3 w-3" />
              {count}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {count > 0 && (
            <button
              onClick={() => navigate(`/activities/${a.id}/stats`)}
              aria-label={`Voir les statistiques de ${a.name}`}
              title="Statistiques"
              className="p-1.5 rounded hover:bg-purple-100 text-purple-600"
            >
              <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          {count > 0 && (
            <button
              onClick={() => handleExportActivity(a)}
              aria-label={`Exporter les inscriptions de ${a.name} en Excel`}
              title="Exporter Excel"
              className="p-1.5 rounded hover:bg-emerald-100 text-emerald-600"
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          {!isArchived && (
            <button
              onClick={() => setImportTarget(a)}
              aria-label={`Importer une liste d'inscriptions dans ${a.name}`}
              title="Importer une liste"
              className="p-1.5 rounded hover:bg-blue-100 text-blue-600"
            >
              <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          <button
            onClick={() => handleEdit(a)}
            aria-label={`Modifier ${a.name}`}
            title="Modifier"
            className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {!isDefault && (
            <button
              onClick={() => setArchiveTarget(a)}
              aria-label={`${isArchived ? 'Réactiver' : 'Archiver'} ${a.name}`}
              title={isArchived ? 'Réactiver' : 'Archiver'}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
            >
              {isArchived
                ? <ArchiveRestore className="h-3.5 w-3.5" aria-hidden="true" />
                : <Archive className="h-3.5 w-3.5" aria-hidden="true" />}
            </button>
          )}
          {canDelete && (
            <button
              onClick={() => setDeleteTarget(a)}
              aria-label={`Supprimer ${a.name}`}
              title="Supprimer"
              className="p-1.5 rounded hover:bg-red-50 text-red-700"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-end mb-4">
        <button onClick={handleNew} className="btn btn-primary">
          <Plus className="h-3.5 w-3.5" />
          Nouvelle activité
        </button>
      </div>

      {active.length === 0 && archived.length === 0 ? (
        <div className="panel p-8 text-center text-gray-500">
          <p className="text-sm">Aucune activité. Créez la première.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {active.length > 0 && (
            <div className="space-y-2">
              {active.map(renderRow)}
            </div>
          )}

          {archived.length > 0 && (
            <div>
              <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2 mt-4">
                Archivées ({archived.length})
              </h2>
              <div className="space-y-2">
                {archived.map(renderRow)}
              </div>
            </div>
          )}
        </div>
      )}

      <ActivityFormModal
        open={formOpen}
        activity={editingActivity}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />

      <ConfirmModal
        open={archiveTarget !== null}
        title={archiveTarget?.archivedAt ? 'Réactiver l\'activité' : 'Archiver l\'activité'}
        message={
          archiveTarget?.archivedAt
            ? `« ${archiveTarget?.name} » sera de nouveau disponible dans le formulaire d'inscription.`
            : `« ${archiveTarget?.name} » sera masquée du formulaire mais ses inscriptions existantes restent intactes.`
        }
        confirmLabel={archiveTarget?.archivedAt ? 'Réactiver' : 'Archiver'}
        onConfirm={confirmArchive}
        onCancel={() => setArchiveTarget(null)}
      />

      <ConfirmModal
        open={deleteTarget !== null}
        title="Supprimer l'activité"
        message={`« ${deleteTarget?.name} » sera définitivement supprimée. Cette action est irréversible.`}
        confirmLabel="Supprimer"
        busyLabel="Suppression..."
        busy={isDeleting}
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      <ImportRegistrationsModal
        open={importTarget !== null}
        activity={importTarget}
        onClose={() => setImportTarget(null)}
        onImported={(count) => {
          showToast('success', `${count} inscription${count > 1 ? 's' : ''} importée${count > 1 ? 's' : ''} dans « ${importTarget?.name} ».`);
          void loadActivities();
        }}
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

export default Activities;
