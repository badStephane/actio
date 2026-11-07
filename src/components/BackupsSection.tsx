import React, { useState } from 'react';
import { Copy, HardDrive } from 'lucide-react';
import { DEMO_MODE } from '../utils/demo';
import BackupActions from './BackupActions';
import AutoBackupsSection from './AutoBackupsSection';
import Toast from './Toast';
import { useToast } from './useToast';

/**
 * Dossier des sauvegardes automatiques : `app_config_dir()/backups` côté Rust (backup.rs),
 * avec l'identifiant de tauri.conf.json. Chemin statique : aucune permission Tauri en plus
 * (garde ACL), et `%APPDATA%` se colle tel quel dans l'Explorateur Windows.
 */
const APP_IDENTIFIER = 'com.badstephane.gestion-inscription';
const BACKUP_PATH_WINDOWS = `%APPDATA%\\${APP_IDENTIFIER}\\backups`;
const BACKUP_PATH_MAC = `~/Library/Application Support/${APP_IDENTIFIER}/backups`;

const isMac = (): boolean => /Mac/i.test(navigator.userAgent);

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * Préférences > Sauvegardes (D20, QA7-05) : sauvegarder, restaurer (confirmation conservée),
 * emplacement lisible et copiable, liste des sauvegardes automatiques.
 */
const BackupsSection: React.FC = () => {
  const { toast, showToast, closeToast } = useToast();
  const path = isMac() ? BACKUP_PATH_MAC : BACKUP_PATH_WINDOWS;
  const [copyState, setCopyState] = useState<CopyState>('idle');

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(path);
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <section aria-labelledby="backups-title" className="border-t border-gray-200 pt-4 space-y-3">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <HardDrive className="h-4 w-4 text-ink-muted" aria-hidden="true" />
          <h4 id="backups-title" className="text-sm font-semibold text-ink">Sauvegardes</h4>
        </div>
        <p className="text-sm text-ink-muted">
          Une sauvegarde est une copie complète de vos données (inscriptions, activités, contacts, historique,
          mot de passe). Enregistrez-en une régulièrement sur une clé USB.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <BackupActions onNotify={showToast} restoreLabel="Restaurer une sauvegarde" />
      </div>
      {DEMO_MODE && <p className="text-sm text-ink-muted">Indisponible en mode démonstration.</p>}

      <div className="rounded-control border border-gray-300 bg-surface-subtle p-3">
        <p className="text-sm font-semibold text-ink-soft">Où sont les sauvegardes automatiques ?</p>
        <p className="mt-1 break-all font-mono text-sm text-ink select-all">{path}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void copyPath()} className="btn btn-default">
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            Copier le chemin
          </button>
          <span role="status" className="text-sm text-ink-muted">
            {copyState === 'copied' && 'Chemin copié.'}
            {copyState === 'failed' && 'Copie impossible : sélectionnez le chemin puis Ctrl+C.'}
          </span>
        </div>
        <p className="mt-2 text-sm text-ink-muted">
          {isMac()
            ? 'Pour ouvrir ce dossier : dans le Finder, menu Aller > Aller au dossier, collez le chemin, puis Entrée.'
            : "Pour ouvrir ce dossier : appuyez sur Windows + R, collez le chemin, puis appuyez sur Entrée."}
        </p>
      </div>

      <AutoBackupsSection />
      <Toast open={toast.open} variant={toast.variant} message={toast.message} onClose={closeToast} />
    </section>
  );
};

export default BackupsSection;
