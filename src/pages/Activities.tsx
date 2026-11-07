import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Activity } from '../types';
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
import ActivityRow, { ActivityListSkeleton } from '../components/ActivityRow';
import { useToast } from '../components/useToast';
import { errorMessage } from '../components/uiFormat';
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

  if (isLoading) return <ActivityListSkeleton />;

  if (loadError) {
    return <LoadError message="Impossible de charger les activités." onRetry={() => void loadActivities()} />;
  }

  const active = activities.filter(a => !a.archivedAt);
  const archived = activities.filter(a => a.archivedAt);

  const renderRow = (a: Activity) => (
    <ActivityRow
      key={a.id}
      activity={a}
      count={counts[a.id] ?? 0}
      countsLoaded={countsLoaded}
      onStats={(act) => navigate(`/activities/${act.id}/stats`)}
      onExport={(act) => void handleExportActivity(act)}
      onImport={setImportTarget}
      onEdit={handleEdit}
      onArchive={setArchiveTarget}
      onDelete={setDeleteTarget}
    />
  );

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-end mb-4">
        <button onClick={handleNew} className="btn btn-primary">
          <Plus className="h-3.5 w-3.5" />
          Nouvelle activité
        </button>
      </div>

      {active.length === 0 && archived.length === 0 ? (
        <div className="panel p-8 text-center text-ink-muted">
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
              <h2 className="text-sm font-semibold text-ink-soft mb-2 mt-4">
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
