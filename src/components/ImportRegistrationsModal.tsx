import React, { useEffect, useRef, useState } from 'react';
import { FileUp, X, AlertCircle, CheckCircle, Download, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { Activity } from '../types';
import { getRegistrations, addRegistrationsBulk } from '../utils/storage';
import {
  parseFile,
  validateRows,
  downloadTemplate,
  ParseResult,
} from '../utils/importRegistrations';

interface ImportRegistrationsModalProps {
  open: boolean;
  activity: Activity | null;
  onClose: () => void;
  onImported: (count: number) => void;
}

type Phase = 'pick' | 'parsing' | 'preview' | 'importing' | 'done';

const ImportRegistrationsModal: React.FC<ImportRegistrationsModalProps> = ({
  open,
  activity,
  onClose,
  onImported,
}) => {
  const [phase, setPhase] = useState<Phase>('pick');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setPhase('pick');
    setError(null);
    setResult(null);
    setImportedCount(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'importing') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose, phase]);

  if (!open || !activity) return null;

  const handleFile = async (file: File) => {
    setError(null);
    setPhase('parsing');
    try {
      const rawRows = await parseFile(file);
      if (rawRows.length === 0) {
        setError('Le fichier ne contient aucune ligne.');
        setPhase('pick');
        return;
      }
      const existing = await getRegistrations();
      const r = validateRows(rawRows, activity, existing);
      setResult(r);
      setPhase('preview');
    } catch (err) {
      console.error('Error parsing file:', err);
      setError("Impossible de lire le fichier. Vérifiez qu'il s'agit d'un .xlsx ou .csv valide.");
      setPhase('pick');
    }
  };

  const handlePickClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!result || result.valid.length === 0) return;
    setPhase('importing');
    try {
      const dataList = result.valid.map(r => r.data!).filter(Boolean);
      await addRegistrationsBulk(dataList);
      setImportedCount(dataList.length);
      setPhase('done');
      onImported(dataList.length);
    } catch (err) {
      console.error('Error importing:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Erreur lors de l'enregistrement: ${msg}`);
      setPhase('preview');
    }
  };

  const renderHeader = (subtitle?: string) => (
    <div className="flex items-start justify-between px-4 py-3 border-b border-gray-200">
      <div className="flex items-center gap-2 min-w-0">
        <FileUp className="h-4 w-4 text-blue-600 flex-shrink-0" />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-800 truncate">
            Importer dans « {activity.name} »
          </h3>
          {subtitle && <p className="text-xs text-gray-500 truncate mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <button
        onClick={onClose}
        disabled={phase === 'importing'}
        className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 disabled:opacity-50"
        aria-label="Fermer"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => phase !== 'importing' && onClose()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="panel shadow-xl max-w-2xl w-full mx-4 overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {phase === 'pick' && (
          <>
            {renderHeader()}
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600">
                Importez une liste d'inscriptions depuis un fichier Excel ou CSV.
                Toutes les lignes valides seront ajoutées à cette activité.
              </p>

              <div className="panel bg-gray-50 p-3 text-xs text-gray-700">
                <p className="font-medium mb-1">Colonnes attendues</p>
                <ul className="space-y-0.5 text-gray-600">
                  <li><b>Nom</b>, <b>Prénoms</b>, <b>Téléphone</b>, <b>Adresse</b> — requis</li>
                  <li><b>Montant</b> — optionnel (utilise le montant par défaut de l'activité si vide)</li>
                  <li><b>Type de paiement</b> — optionnel (cash, wave, orange money — défaut: cash)</li>
                  <li><b>Date d'inscription</b> — optionnel (format AAAA-MM-JJ ou JJ/MM/AAAA — défaut: aujourd'hui)</li>
                </ul>
              </div>

              {error && (
                <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={handlePickClick}
                className="w-full border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50/30 rounded p-6 text-center transition-colors"
              >
                <FileSpreadsheet className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-gray-700">Sélectionner un fichier</p>
                <p className="text-xs text-gray-500 mt-1">Excel (.xlsx) ou CSV</p>
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            <div className="flex justify-between items-center gap-2 px-4 py-3 bg-gray-50 border-t border-gray-200">
              <button onClick={downloadTemplate} className="btn btn-ghost">
                <Download className="h-3.5 w-3.5" />
                Télécharger le modèle
              </button>
              <button onClick={onClose} className="btn btn-default">
                Annuler
              </button>
            </div>
          </>
        )}

        {phase === 'parsing' && (
          <>
            {renderHeader('Lecture du fichier...')}
            <div className="p-10 flex flex-col items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent mb-3" />
              <p className="text-sm text-gray-600">Analyse en cours...</p>
            </div>
          </>
        )}

        {phase === 'preview' && result && (
          <>
            {renderHeader(`${result.total} ligne(s) lues`)}
            <div className="flex-1 overflow-auto">
              <div className="grid grid-cols-3 gap-2 p-3 border-b border-gray-200 bg-gray-50">
                <div className="panel px-3 py-2 border-l-2 border-l-emerald-500">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-emerald-700">À importer</div>
                  <div className="text-base font-semibold text-gray-900 tabular-nums mt-0.5">{result.valid.length}</div>
                </div>
                <div className="panel px-3 py-2 border-l-2 border-l-amber-400">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-amber-700">Doublons</div>
                  <div className="text-base font-semibold text-gray-900 tabular-nums mt-0.5">{result.duplicates.length}</div>
                </div>
                <div className="panel px-3 py-2 border-l-2 border-l-red-500">
                  <div className="text-[10px] font-medium uppercase tracking-wider text-red-700">Erreurs</div>
                  <div className="text-base font-semibold text-gray-900 tabular-nums mt-0.5">{result.invalid.length}</div>
                </div>
              </div>

              <div className="px-4 py-3 space-y-3">
                {error && (
                  <div className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                    <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {result.valid.length > 0 && (
                  <details open className="text-xs">
                    <summary className="cursor-pointer text-emerald-700 font-medium mb-1">
                      Aperçu des inscriptions valides ({result.valid.length})
                    </summary>
                    <div className="overflow-x-auto mt-2 border border-gray-200 rounded">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 border-b border-gray-200">
                          <tr>
                            <th className="text-left px-2 py-1.5 font-medium text-gray-600">Ligne</th>
                            <th className="text-left px-2 py-1.5 font-medium text-gray-600">Nom Prénoms</th>
                            <th className="text-left px-2 py-1.5 font-medium text-gray-600">Téléphone</th>
                            <th className="text-right px-2 py-1.5 font-medium text-gray-600">Montant</th>
                            <th className="text-left px-2 py-1.5 font-medium text-gray-600">Paiement</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {result.valid.slice(0, 5).map(r => (
                            <tr key={r.rowNumber}>
                              <td className="px-2 py-1.5 text-gray-500 tabular-nums">{r.rowNumber}</td>
                              <td className="px-2 py-1.5 text-gray-900">{r.data?.lastName} {r.data?.firstName}</td>
                              <td className="px-2 py-1.5 text-gray-700 tabular-nums">{r.data?.phone}</td>
                              <td className="px-2 py-1.5 text-right text-gray-900 tabular-nums">{r.data?.amount}</td>
                              <td className="px-2 py-1.5 text-gray-700">{r.data?.paymentType}</td>
                            </tr>
                          ))}
                          {result.valid.length > 5 && (
                            <tr>
                              <td colSpan={5} className="px-2 py-1.5 text-gray-500 italic text-center">
                                ...et {result.valid.length - 5} autre(s)
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}

                {result.duplicates.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-amber-700 font-medium">
                      Doublons ignorés ({result.duplicates.length})
                    </summary>
                    <ul className="mt-2 space-y-1 text-gray-600">
                      {result.duplicates.slice(0, 10).map(r => (
                        <li key={r.rowNumber} className="flex gap-2">
                          <span className="text-gray-400 tabular-nums">L.{r.rowNumber}</span>
                          <span>{r.data?.lastName} {r.data?.firstName} — {r.data?.phone}</span>
                        </li>
                      ))}
                      {result.duplicates.length > 10 && (
                        <li className="text-gray-500 italic">...et {result.duplicates.length - 10} autre(s)</li>
                      )}
                    </ul>
                  </details>
                )}

                {result.invalid.length > 0 && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-red-700 font-medium">
                      Erreurs ({result.invalid.length})
                    </summary>
                    <ul className="mt-2 space-y-1 text-gray-700">
                      {result.invalid.slice(0, 20).map(r => (
                        <li key={r.rowNumber} className="flex gap-2">
                          <span className="text-gray-400 tabular-nums flex-shrink-0">L.{r.rowNumber}</span>
                          <span><b>{r.error}</b></span>
                        </li>
                      ))}
                      {result.invalid.length > 20 && (
                        <li className="text-gray-500 italic">...et {result.invalid.length - 20} autre(s)</li>
                      )}
                    </ul>
                  </details>
                )}
              </div>
            </div>

            <div className="flex justify-end items-center gap-2 px-4 py-3 bg-gray-50 border-t border-gray-200">
              <button onClick={onClose} className="btn btn-default">
                Annuler
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={result.valid.length === 0}
                className="btn btn-primary disabled:opacity-50 disabled:pointer-events-none"
              >
                <FileUp className="h-3.5 w-3.5" />
                Importer {result.valid.length} inscription{result.valid.length > 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}

        {phase === 'importing' && (
          <>
            {renderHeader('Importation...')}
            <div className="p-10 flex flex-col items-center justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-500 border-t-transparent mb-3" />
              <p className="text-sm text-gray-600">Enregistrement en base...</p>
            </div>
          </>
        )}

        {phase === 'done' && (
          <>
            {renderHeader('Terminé')}
            <div className="p-8 text-center">
              <CheckCircle className="h-12 w-12 text-emerald-500 mx-auto mb-3" />
              <p className="text-base font-semibold text-gray-900">
                {importedCount} inscription{importedCount > 1 ? 's' : ''} importée{importedCount > 1 ? 's' : ''}
              </p>
              {result && (result.duplicates.length > 0 || result.invalid.length > 0) && (
                <p className="text-xs text-gray-500 mt-2 inline-flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3" />
                  {result.duplicates.length} doublon{result.duplicates.length > 1 ? 's' : ''} ignoré{result.duplicates.length > 1 ? 's' : ''},{' '}
                  {result.invalid.length} erreur{result.invalid.length > 1 ? 's' : ''}
                </p>
              )}
            </div>
            <div className="flex justify-end px-4 py-3 bg-gray-50 border-t border-gray-200">
              <button onClick={onClose} className="btn btn-primary">Fermer</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default ImportRegistrationsModal;
