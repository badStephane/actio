import React from 'react';
import { DatabaseZap, RefreshCw } from 'lucide-react';
import actioLogo from '../assets/brand/actio-logo.svg';
import { BACKUP_DIR_LABEL } from '../utils/dbBackup';
import BackupActions from './BackupActions';
import Toast from './Toast';
import { useToast } from './useToast';

interface AuthErrorScreenProps {
  detail: string | null;
  onRetry: () => void;
}

/**
 * Base illisible au démarrage (M8) : écran dédié, jamais l'écran de création
 * du mot de passe (sinon l'ancien serait écrasé dès que la base se libère).
 */
const AuthErrorScreen: React.FC<AuthErrorScreenProps> = ({ detail, onRetry }) => {
  const { toast, showToast, closeToast } = useToast();

  return (
    <div className="h-full flex items-center justify-center bg-brand-900">
      <div role="alert" className="panel shadow-2xl w-full max-w-md mx-4 p-6 text-center">
        <img src={actioLogo} alt="Actio" className="h-9 w-auto mx-auto mb-4" />
        <DatabaseZap className="h-10 w-10 text-red-600 mx-auto mb-3" aria-hidden="true" />
        <h1 className="text-base font-semibold text-gray-900 mb-1">
          Impossible d'ouvrir la base de données
        </h1>
        <p className="text-sm text-gray-600 mb-2">
          La base est peut-être utilisée par un autre programme, ou endommagée. Fermez les autres
          fenêtres d'Actio puis réessayez.
        </p>
        {detail && (
          <p className="text-xs text-gray-600 font-mono wrap-break-word bg-gray-50 border border-gray-200 rounded-sm px-2 py-1 mb-3">
            {detail}
          </p>
        )}
        <p className="text-xs text-gray-600 mb-4">
          Si le problème persiste, vous pouvez restaurer une sauvegarde. Les sauvegardes
          automatiques se trouvent dans : <span className="font-medium">{BACKUP_DIR_LABEL}</span>.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button type="button" onClick={onRetry} className="btn btn-primary">
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Réessayer
          </button>
          <BackupActions
            onNotify={showToast}
            showExport={false}
            restoreLabel="Restaurer une sauvegarde"
          />
        </div>
      </div>
      <Toast open={toast.open} variant={toast.variant} message={toast.message} onClose={closeToast} />
    </div>
  );
};

export default AuthErrorScreen;
