import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CircleCheckBig, Info, WandSparkles } from 'lucide-react';
import { findSuspiciousRegistrations, markReviewed, SuspiciousRegistration } from '../utils/importReview';
import { updateRegistration } from '../utils/storage';
import { getActivities } from '../utils/activities';
import { Activity } from '../types';
import ConfirmModal from '../components/ConfirmModal';
import LoadError from '../components/LoadError';
import Toast from '../components/Toast';
import ImportReviewRow, { RowStatus } from '../components/ImportReviewRow';
import { applySuggestion, hasSuggestion } from '../components/importReviewModel';
import { useToast } from '../components/useToast';
import { errorMessage, formatAmount } from '../components/uiFormat';

type LoadState = 'loading' | 'error' | 'ready';
interface RowState { status: RowStatus; error?: string }

const sumAmounts = (items: SuspiciousRegistration[], pick: (s: SuspiciousRegistration) => number): number =>
  items.reduce((acc, s) => acc + pick(s), 0);

/**
 * Contrôle des imports déjà faits (Avenant A1) : l'opérateur revoit chaque
 * inscription suspecte. Aucune correction automatique ; correction groupée
 * seulement après confirmation explicite.
 */
const ImportReview: React.FC = () => {
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [items, setItems] = useState<SuspiciousRegistration[]>([]);
  const [activitiesById, setActivitiesById] = useState<Record<string, Activity>>({});
  const [rowStates, setRowStates] = useState<Record<string, RowState>>({});
  const [processedCount, setProcessedCount] = useState(0);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  const { toast, showToast, closeToast } = useToast();

  const load = useCallback(async () => {
    setLoadState('loading');
    try {
      const [found, acts] = await Promise.all([findSuspiciousRegistrations(), getActivities(true)]);
      setItems(found);
      setActivitiesById(Object.fromEntries(acts.map(a => [a.id, a])));
      setRowStates({});
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- chargement asynchrone au montage (état de chargement posé avant l'await), refonte notée hors 2.2.0
    void load();
  }, [load]);

  const setRowState = (id: string, state: RowState) =>
    setRowStates(prev => ({ ...prev, [id]: state }));

  const markDone = (id: string) => {
    setItems(prev => prev.filter(s => s.registration.id !== id));
    setRowStates(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => k !== id)));
    setProcessedCount(n => n + 1);
  };

  /** Applique la suggestion puis marque la ligne revue ; renvoie un message d'erreur ou null. */
  const applyOne = async (item: SuspiciousRegistration): Promise<string | null> => {
    try {
      await updateRegistration(applySuggestion(item));
    } catch (err) {
      return errorMessage(err, 'La correction n\'a pas pu être enregistrée.');
    }
    try {
      await markReviewed(item.registration.id);
    } catch {
      return 'Correction enregistrée, mais la ligne n\'a pas pu être marquée comme revue. Rechargez la liste.';
    }
    return null;
  };

  const handleApply = async (item: SuspiciousRegistration) => {
    const id = item.registration.id;
    setRowState(id, { status: 'busy' });
    const failure = await applyOne(item);
    if (failure) setRowState(id, { status: 'error', error: failure });
    else markDone(id);
  };

  const handleKeep = async (item: SuspiciousRegistration) => {
    const id = item.registration.id;
    setRowState(id, { status: 'busy' });
    try {
      await markReviewed(id);
      markDone(id);
    } catch (err) {
      setRowState(id, { status: 'error', error: errorMessage(err, 'Impossible d\'enregistrer la vérification.') });
    }
  };

  const withSuggestion = useMemo(() => items.filter(hasSuggestion), [items]);

  const handleBulkApply = async () => {
    setIsBulkRunning(true);
    let failures = 0;
    for (const item of withSuggestion) {
      const failure = await applyOne(item);
      if (failure) {
        failures += 1;
        setRowState(item.registration.id, { status: 'error', error: failure });
      } else {
        markDone(item.registration.id);
      }
    }
    setIsBulkRunning(false);
    setBulkOpen(false);
    const applied = withSuggestion.length - failures;
    showToast(
      failures > 0 ? 'error' : 'success',
      failures > 0
        ? `${applied} correction(s) appliquée(s), ${failures} en échec : voir les lignes signalées.`
        : `${applied} correction(s) appliquée(s).`
    );
  };

  if (loadState === 'loading') {
    return (
      <div className="page space-y-2" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-10 rounded" />)}
        <span className="sr-only">Recherche des inscriptions à vérifier...</span>
      </div>
    );
  }

  if (loadState === 'error') {
    return <LoadError message="Impossible d'analyser les inscriptions importées." onRetry={() => void load()} />;
  }

  if (items.length === 0) {
    return (
      <div className="page">
        <div className="panel p-8 text-center" role="status">
          <CircleCheckBig className="h-10 w-10 text-emerald-600 mx-auto mb-3" aria-hidden="true" />
          <p className="text-sm font-semibold text-gray-800">Aucune inscription à vérifier</p>
          {processedCount > 0 && (
            <p className="text-xs text-gray-600 mt-1">{processedCount} inscription(s) vérifiée(s) pendant cette session.</p>
          )}
          <Link to="/" className="btn btn-default mt-4">Retour à l'accueil</Link>
        </div>
      </div>
    );
  }

  const failedCount = Object.values(rowStates).filter(s => s.status === 'error').length;
  const isAnyBusy = isBulkRunning || Object.values(rowStates).some(s => s.status === 'busy');
  const currentTotal = sumAmounts(withSuggestion, s => s.registration.amount);
  const suggestedTotal = sumAmounts(withSuggestion, s => s.suggestedAmount ?? s.registration.amount);

  return (
    <div className="page space-y-3">
      <div className="panel p-3 flex items-start gap-2 text-xs text-gray-700">
        <Info className="h-4 w-4 text-brand-600 flex-shrink-0 mt-px" aria-hidden="true" />
        <p>
          Ces inscriptions viennent d'imports Excel où des montants ou des dates ont pu être mal lus. Rien n'est
          corrigé automatiquement : comparez avec votre fichier ou vos reçus, puis appliquez la suggestion ou
          confirmez que la valeur actuelle est correcte. Chaque correction est inscrite dans l'historique.
        </p>
      </div>

      {(processedCount > 0 || failedCount > 0) && (
        <p role="status" className="text-xs text-gray-700">
          {processedCount} vérifiée(s), {items.length} restante(s)
          {failedCount > 0 && <span className="text-red-700"> ; {failedCount} en erreur, à reprendre</span>}.
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-gray-600">{items.length} inscription(s) à vérifier</span>
        {withSuggestion.length > 1 && (
          <button
            type="button"
            onClick={() => setBulkOpen(true)}
            disabled={isAnyBusy}
            className="btn btn-default disabled:opacity-50 disabled:pointer-events-none"
          >
            <WandSparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Appliquer toutes les suggestions ({withSuggestion.length})
          </button>
        )}
      </div>

      <div className="panel overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-3 py-2 font-medium text-gray-700">Inscription</th>
              <th className="text-left px-3 py-2 font-medium text-gray-700">Raison</th>
              <th className="text-left px-3 py-2 font-medium text-gray-700">Valeur actuelle</th>
              <th className="text-left px-3 py-2 font-medium text-gray-700">Valeur suggérée</th>
              <th className="text-right px-3 py-2 font-medium text-gray-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {items.map(item => (
              <ImportReviewRow
                key={item.registration.id}
                item={item}
                activity={activitiesById[item.registration.activityId]}
                status={rowStates[item.registration.id]?.status ?? 'idle'}
                errorText={rowStates[item.registration.id]?.error}
                isLocked={isBulkRunning}
                onApply={(i) => void handleApply(i)}
                onKeep={(i) => void handleKeep(i)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <ConfirmModal
        open={bulkOpen}
        title="Appliquer toutes les suggestions"
        message={
          <>
            <p>
              <b>{withSuggestion.length} inscriptions</b> vont recevoir la valeur suggérée (montant et/ou date).
            </p>
            <p>
              Total de ces montants : {formatAmount(currentTotal)} aujourd'hui, {formatAmount(suggestedTotal)} après
              correction. Chaque modification est inscrite dans l'historique.
            </p>
            <p>Vérifiez d'abord quelques lignes sur vos reçus : une suggestion peut être fausse.</p>
          </>
        }
        confirmLabel="Appliquer les corrections"
        busyLabel="Correction en cours..."
        busy={isBulkRunning}
        onConfirm={() => void handleBulkApply()}
        onCancel={() => setBulkOpen(false)}
      />

      <Toast open={toast.open} variant={toast.variant} message={toast.message} onClose={closeToast} />
    </div>
  );
};

export default ImportReview;
