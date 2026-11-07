import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, X, Clock, ListChecks } from 'lucide-react';
import { useAuth } from './authContext';
import ContactBookSection from './ContactBookSection';
import AutoBackupsSection from './AutoBackupsSection';
import UpdateCheckSection from './UpdateCheckSection';

interface PreferencesModalProps {
  open: boolean;
  onClose: () => void;
}

const AUTO_LOCK_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: 'Jamais' },
  { value: 5, label: '5 minutes' },
  { value: 10, label: '10 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 60, label: '1 heure' },
];

const PreferencesModal: React.FC<PreferencesModalProps> = ({ open, onClose }) => {
  const { autoLockMinutes, setAutoLockMinutes } = useAuth();
  const navigate = useNavigate();

  const openImportReview = () => {
    onClose();
    navigate('/imports/review');
  };

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="preferences-title"
    >
      <div
        className="panel shadow-xl max-w-md w-full mx-4 overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-blue-600" aria-hidden="true" />
            <h3 id="preferences-title" className="text-sm font-semibold text-gray-800">
              Préférences
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 transition-colors"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-5 overflow-auto">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Clock className="h-3.5 w-3.5 text-gray-600" aria-hidden="true" />
              <label htmlFor="auto-lock" className="text-xs font-medium text-gray-700">
                Verrouillage automatique
              </label>
            </div>
            <p className="text-xs text-gray-600 mb-2">
              Verrouille l'écran après une période d'inactivité ; une saisie en cours est conservée.
              Le verrouillage protège l'écran, pas le fichier de données : activez aussi le
              chiffrement du disque (BitLocker, FileVault).
            </p>
            <select
              id="auto-lock"
              value={autoLockMinutes}
              onChange={(e) => setAutoLockMinutes(parseInt(e.target.value, 10))}
              className="input-field"
            >
              {AUTO_LOCK_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center gap-2 mb-1">
              <ListChecks className="h-3.5 w-3.5 text-gray-600" aria-hidden="true" />
              <h4 className="text-xs font-medium text-gray-700">Contrôle des imports</h4>
            </div>
            <p className="text-xs text-gray-600 mb-2">
              Vérifie les inscriptions importées depuis Excel dont le montant ou la date a pu être mal lu.
            </p>
            <button type="button" onClick={openImportReview} className="btn btn-default">
              Ouvrir le contrôle des imports
            </button>
          </div>

          <ContactBookSection />
          <AutoBackupsSection />
          <UpdateCheckSection />
        </div>

        <div className="flex justify-end px-4 py-3 bg-gray-50 border-t border-gray-200">
          <button onClick={onClose} className="btn btn-default">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
};

export default PreferencesModal;
