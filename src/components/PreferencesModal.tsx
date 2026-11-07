import React, { useEffect, useRef, useState } from 'react';
import {
  Settings,
  X,
  Clock,
  BookUser,
  FileUp,
  Trash2,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';
import { useAuth } from './AuthGate';
import {
  countContacts,
  listSources,
  addContactsBulk,
  clearContacts,
  getAllContactDedupKeys,
} from '../utils/contacts';
import {
  parseContactsFile,
  validateContactRows,
  ContactParseResult,
} from '../utils/importContacts';
import ConfirmModal from './ConfirmModal';
import Toast, { ToastVariant } from './Toast';

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

interface SourceEntry {
  source: string;
  count: number;
}

const PreferencesModal: React.FC<PreferencesModalProps> = ({ open, onClose }) => {
  const { autoLockMinutes, setAutoLockMinutes } = useAuth();

  const [contactCount, setContactCount] = useState<number | null>(null);
  const [sources, setSources] = useState<SourceEntry[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ContactParseResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [sourceLabel, setSourceLabel] = useState<string>('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [clearTarget, setClearTarget] = useState<string | 'all' | null>(null);
  const [toast, setToast] = useState<{ open: boolean; variant: ToastVariant; message: string }>({
    open: false,
    variant: 'success',
    message: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showToast = (variant: ToastVariant, message: string) =>
    setToast({ open: true, variant, message });

  const refreshContacts = async () => {
    try {
      const [n, s] = await Promise.all([countContacts(), listSources()]);
      setContactCount(n);
      setSources(s);
    } catch (error) {
      console.error('Error loading contacts info:', error);
      setContactCount(0);
      setSources([]);
    }
  };

  useEffect(() => {
    if (!open) return;
    refreshContacts();
    setImportResult(null);
    setImportError(null);
    setPendingFile(null);
    setSourceLabel(`Import du ${new Date().toLocaleDateString('fr-FR')}`);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const handlePickFile = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setPendingFile(file);
    setImportError(null);
    setImportResult(null);
    setImporting(true);
    try {
      const rows = await parseContactsFile(file);
      if (rows.length === 0) {
        setImportError('Le fichier ne contient aucune ligne.');
        setPendingFile(null);
        return;
      }
      const existing = await getAllContactDedupKeys();
      const result = validateContactRows(rows, existing, sourceLabel.trim() || undefined);
      setImportResult(result);
    } catch (err) {
      console.error('Error parsing contacts file:', err);
      setImportError("Lecture impossible. Vérifiez que c'est un .xlsx, .csv ou .tsv valide.");
      setPendingFile(null);
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importResult || importResult.valid.length === 0) return;
    setImporting(true);
    try {
      const dataList = importResult.valid.map(r => r.data!).filter(Boolean);
      const inserted = await addContactsBulk(dataList);
      showToast(
        'success',
        `${inserted} contact${inserted > 1 ? 's' : ''} ajouté${inserted > 1 ? 's' : ''} au carnet.`
      );
      setImportResult(null);
      setPendingFile(null);
      await refreshContacts();
    } catch (err) {
      console.error('Error importing contacts:', err);
      const msg = err instanceof Error ? err.message : String(err);
      showToast('error', `Erreur: ${msg}`);
    } finally {
      setImporting(false);
    }
  };

  const handleConfirmClear = async () => {
    if (!clearTarget) return;
    const target = clearTarget;
    setClearTarget(null);
    try {
      const removed = await clearContacts(target === 'all' ? undefined : target);
      showToast(
        'success',
        `${removed} contact${removed > 1 ? 's' : ''} supprimé${removed > 1 ? 's' : ''}.`
      );
      await refreshContacts();
    } catch (err) {
      console.error('Error clearing contacts:', err);
      showToast('error', 'Erreur lors de la suppression.');
    }
  };

  const cancelImport = () => {
    setImportResult(null);
    setImportError(null);
    setPendingFile(null);
  };

  return (
    <>
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
              <Settings className="h-4 w-4 text-blue-600" />
              <h3 id="preferences-title" className="text-sm font-semibold text-gray-800">
                Préférences
              </h3>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-4 space-y-5 overflow-auto">
            {/* Auto-lock */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-3.5 w-3.5 text-gray-500" />
                <label htmlFor="auto-lock" className="text-xs font-medium text-gray-700">
                  Verrouillage automatique
                </label>
              </div>
              <p className="text-xs text-gray-500 mb-2">
                Verrouille l'application après une période d'inactivité.
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

            {/* Address book */}
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center gap-2 mb-1">
                <BookUser className="h-3.5 w-3.5 text-gray-500" />
                <span className="text-xs font-medium text-gray-700">Carnet d'adresses</span>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Source d'autocomplétion utilisée par le formulaire d'inscription. Importez une
                liste pour proposer des suggestions sur Nom, Prénom et Téléphone.
              </p>

              <div className="panel bg-gray-50 px-3 py-2 mb-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Total</span>
                  <span className="text-sm font-semibold text-gray-900 tabular-nums">
                    {contactCount === null ? '…' : contactCount}
                  </span>
                </div>
                {sources.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-gray-200 pt-2">
                    {sources.map(s => (
                      <li
                        key={s.source}
                        className="flex items-center justify-between text-xs text-gray-600"
                      >
                        <span className="truncate" title={s.source}>{s.source}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="tabular-nums">{s.count}</span>
                          <button
                            type="button"
                            onClick={() => setClearTarget(s.source)}
                            className="text-gray-400 hover:text-red-600"
                            aria-label={`Supprimer ${s.source}`}
                            title="Supprimer cette source"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Import controls */}
              {!importResult && !pendingFile && (
                <>
                  <label
                    htmlFor="contact-source-label"
                    className="block text-[11px] font-medium text-gray-600 mb-1"
                  >
                    Étiquette de la source
                  </label>
                  <input
                    id="contact-source-label"
                    type="text"
                    value={sourceLabel}
                    onChange={(e) => setSourceLabel(e.target.value)}
                    placeholder="Ex. Liste 2024"
                    className="input-field mb-2"
                  />
                  <p className="text-[11px] text-gray-500 mb-2">
                    Format attendu (sans en-tête possible) : <b>N</b>, <b>Nom</b>, <b>Prénom</b>,{' '}
                    <b>Adresse</b>, <b>Téléphone</b> — séparé par tabulation, virgule ou Excel.
                  </p>

                  {importError && (
                    <div className="flex items-start gap-2 px-2 py-1.5 mb-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                      <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                      <span>{importError}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handlePickFile}
                      className="btn btn-primary"
                      disabled={importing}
                    >
                      <FileUp className="h-3.5 w-3.5" />
                      {importing ? 'Lecture…' : 'Importer un fichier'}
                    </button>
                    {(contactCount ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => setClearTarget('all')}
                        className="btn btn-default text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Vider le carnet
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,.tsv,.txt"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </>
              )}

              {/* Preview */}
              {importResult && (
                <div className="panel border-blue-200 bg-blue-50/40 p-3">
                  <p className="text-xs font-medium text-gray-800 mb-2">
                    Aperçu de l'import {pendingFile && `« ${pendingFile.name} »`}
                  </p>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="panel px-2 py-1.5 border-l-2 border-l-emerald-500 bg-white">
                      <div className="text-[10px] uppercase tracking-wider text-emerald-700">À ajouter</div>
                      <div className="text-sm font-semibold text-gray-900 tabular-nums">
                        {importResult.valid.length}
                      </div>
                    </div>
                    <div className="panel px-2 py-1.5 border-l-2 border-l-amber-400 bg-white">
                      <div className="text-[10px] uppercase tracking-wider text-amber-700">Doublons</div>
                      <div className="text-sm font-semibold text-gray-900 tabular-nums">
                        {importResult.duplicates.length}
                      </div>
                    </div>
                    <div className="panel px-2 py-1.5 border-l-2 border-l-red-500 bg-white">
                      <div className="text-[10px] uppercase tracking-wider text-red-700">Erreurs</div>
                      <div className="text-sm font-semibold text-gray-900 tabular-nums">
                        {importResult.invalid.length}
                      </div>
                    </div>
                  </div>

                  {importResult.invalid.length > 0 && (
                    <details className="text-xs mb-2">
                      <summary className="cursor-pointer text-red-700 font-medium">
                        Voir les erreurs ({importResult.invalid.length})
                      </summary>
                      <ul className="mt-1.5 space-y-0.5 max-h-32 overflow-auto">
                        {importResult.invalid.slice(0, 30).map(r => (
                          <li key={r.rowNumber} className="flex gap-2 text-gray-700">
                            <span className="text-gray-400 tabular-nums">L.{r.rowNumber}</span>
                            <span>{r.error}</span>
                          </li>
                        ))}
                        {importResult.invalid.length > 30 && (
                          <li className="text-gray-500 italic">…et plus</li>
                        )}
                      </ul>
                    </details>
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={cancelImport}
                      className="btn btn-default"
                      disabled={importing}
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmImport}
                      disabled={importing || importResult.valid.length === 0}
                      className="btn btn-primary disabled:opacity-50 disabled:pointer-events-none"
                    >
                      <CheckCircle className="h-3.5 w-3.5" />
                      {importing
                        ? 'Import…'
                        : `Ajouter ${importResult.valid.length} contact${importResult.valid.length > 1 ? 's' : ''}`}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end px-4 py-3 bg-gray-50 border-t border-gray-200">
            <button onClick={onClose} className="btn btn-default">
              Fermer
            </button>
          </div>
        </div>
      </div>

      <ConfirmModal
        open={clearTarget !== null}
        title={
          clearTarget === 'all' ? 'Vider le carnet d\'adresses' : 'Supprimer cette source'
        }
        message={
          clearTarget === 'all'
            ? 'Tous les contacts seront supprimés du carnet. Les inscriptions existantes restent intactes.'
            : `Tous les contacts importés sous « ${clearTarget} » seront supprimés.`
        }
        confirmLabel="Supprimer"
        variant="danger"
        onConfirm={handleConfirmClear}
        onCancel={() => setClearTarget(null)}
      />

      <Toast
        open={toast.open}
        variant={toast.variant}
        message={toast.message}
        onClose={() => setToast(t => ({ ...t, open: false }))}
      />
    </>
  );
};

export default PreferencesModal;
