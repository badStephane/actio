import React, { useEffect, useRef, useState } from 'react';
import { Save, Upload } from 'lucide-react';
import { exportDatabase, restoreDatabase, BACKUP_DIR_LABEL } from '../utils/dbBackup';
import ConfirmModal from './ConfirmModal';
import { ToastVariant } from './Toast';
import { errorMessage } from './uiFormat';

interface BackupActionsProps {
  onNotify: (variant: ToastVariant, message: string) => void;
  showExport?: boolean;
  restoreLabel?: string;
}

/** Délai de repli si l'application n'a pas redémarré d'elle-même après restauration. */
const RESTART_FALLBACK_MS = 3000;

const RESTORE_MESSAGE = (
  <>
    <p>
      <b>Tout le contenu actuel sera remplacé</b> par celui du fichier choisi : inscriptions,
      activités, contacts, historique, <b>y compris le mot de passe</b> et le code de récupération.
    </p>
    <p>
      Une sauvegarde automatique de l'état actuel est faite avant le remplacement, dans :{' '}
      <span className="font-medium text-gray-800">{BACKUP_DIR_LABEL}</span>.
    </p>
    <p>L'application redémarrera ensuite.</p>
  </>
);

/** Boutons « Sauvegarder » et « Restaurer » de la base (B1, côté écran). */
const BackupActions: React.FC<BackupActionsProps> = ({
  onNotify,
  showExport = true,
  restoreLabel = 'Restaurer',
}) => {
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const fallbackTimerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(fallbackTimerRef.current), []);

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const ok = await exportDatabase();
      if (ok) onNotify('success', 'Base de données sauvegardée.');
    } catch (err) {
      onNotify('error', errorMessage(err, 'La sauvegarde a échoué.'));
    } finally {
      setIsExporting(false);
    }
  };

  const confirmRestore = async () => {
    setIsRestoring(true);
    try {
      const ok = await restoreDatabase();
      if (!ok) {
        setIsRestoring(false);
        setRestoreOpen(false);
        return;
      }
      onNotify('success', 'Base restaurée. Redémarrage...');
      fallbackTimerRef.current = window.setTimeout(
        () => window.location.reload(),
        RESTART_FALLBACK_MS
      );
    } catch (err) {
      setIsRestoring(false);
      setRestoreOpen(false);
      onNotify('error', errorMessage(err, 'La restauration a échoué. Vos données actuelles sont conservées.'));
    }
  };

  return (
    <>
      {showExport && (
        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting}
          className="btn btn-default disabled:opacity-50 disabled:pointer-events-none"
        >
          <Save className="h-3.5 w-3.5" aria-hidden="true" />
          {isExporting ? 'Sauvegarde...' : 'Sauvegarder'}
        </button>
      )}

      <button type="button" onClick={() => setRestoreOpen(true)} className="btn btn-warning">
        <Upload className="h-3.5 w-3.5" aria-hidden="true" />
        {restoreLabel}
      </button>

      <ConfirmModal
        open={restoreOpen}
        title="Restaurer une sauvegarde"
        message={RESTORE_MESSAGE}
        confirmLabel="Choisir le fichier et restaurer"
        busyLabel="Restauration..."
        busy={isRestoring}
        variant="danger"
        onConfirm={confirmRestore}
        onCancel={() => setRestoreOpen(false)}
      />
    </>
  );
};

export default BackupActions;
