import React, { useEffect, useRef, useState } from 'react';
import { FileUp, X, AlertCircle, CheckCircle, Download, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { Activity } from '../types';
import { getRegistrations, addRegistrationsBulk } from '../utils/storage';
import {
  parseFile,
  validateRows,
  fillAddressesFromContacts,
  downloadTemplate,
  ParseResult,
} from '../utils/importRegistrations';
import ImportPreview from './ImportPreview';
import { errorMessage } from './uiFormat';

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
  const [isMissingConfirmed, setIsMissingConfirmed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setPhase('pick');
    setError(null);
    setResult(null);
    setImportedCount(0);
    setIsMissingConfirmed(false);
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

  // QA-03 : une colonne attendue absente exige une confirmation explicite.
  const needsMissingConfirmation = (result?.missingColumns.length ?? 0) > 0;
  const canImport =
    result !== null && result.valid.length > 0 && (!needsMissingConfirmation || isMissingConfirmed);

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
      // D19 : adresses vides complétées par le carnet de contacts (même clé que les doublons).
      setResult(await fillAddressesFromContacts(validateRows(rawRows, activity, existing)));
      setIsMissingConfirmed(false);
      setPhase('preview');
    } catch (err) {
      setError(errorMessage(err, "Impossible de lire le fichier. Vérifiez qu'il s'agit d'un .xlsx ou .csv valide."));
      setPhase('pick');
    }
  };

  const handlePickClick = () => fileInputRef.current?.click();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = '';
  };

  const handleConfirmImport = async () => {
    if (!result || !canImport) return;
    setPhase('importing');
    try {
      const dataList = result.valid.flatMap(r => (r.data ? [r.data] : []));
      await addRegistrationsBulk(dataList);
      setImportedCount(dataList.length);
      setPhase('done');
      onImported(dataList.length);
    } catch (err) {
      // Import atomique (contrat 03) : rien n'a été enregistré.
      setError(
        `Aucune inscription n'a été importée : ${errorMessage(err, 'erreur d\'enregistrement')}. Corrigez puis réessayez.`
      );
      setPhase('preview');
    }
  };

  const renderHeader = (subtitle?: string) => (
    <div className="flex items-start justify-between px-4 py-3 border-b border-gray-200">
      <div className="flex items-center gap-2 min-w-0">
        <FileUp className="h-4 w-4 text-brand-600 flex-shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <h3 id="import-modal-title" className="text-sm font-semibold text-gray-800 truncate">
            Importer dans « {activity.name} »
          </h3>
          {subtitle && <p className="text-xs text-gray-600 truncate mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <button
        onClick={onClose}
        disabled={phase === 'importing'}
        className="text-gray-500 hover:text-gray-700 transition-colors flex-shrink-0 disabled:opacity-50"
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
      aria-labelledby="import-modal-title"
    >
      <div
        className="panel shadow-xl max-w-3xl w-full mx-4 overflow-hidden flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {phase === 'pick' && (
          <>
            {renderHeader()}
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-700">
                Importez une liste d'inscriptions depuis un fichier Excel ou CSV.
                Toutes les lignes valides seront ajoutées à cette activité, en une seule fois.
              </p>

              <div className="panel bg-gray-50 p-3 text-xs text-gray-700">
                <p className="font-medium mb-1">Colonnes attendues</p>
                <ul className="space-y-0.5 text-gray-700">
                  <li><b>Nom</b>, <b>Prénoms</b>, <b>Téléphone</b> : requis</li>
                  <li><b>Adresse</b> : facultative (reprise du carnet de contacts si la personne y figure)</li>
                  <li><b>Montant</b> : entier en F CFA, sans décimales (montant par défaut de l'activité si la cellule est vide)</li>
                  <li><b>Mode de paiement</b> : espèces, wave ou orange money (colonne absente : espèces)</li>
                  <li><b>Date d'inscription</b> : AAAA-MM-JJ ou JJ/MM/AAAA (date du jour si vide)</li>
                </ul>
              </div>

              {error && (
                <div role="alert" className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <button
                onClick={handlePickClick}
                className="w-full border-2 border-dashed border-gray-300 hover:border-brand-400 hover:bg-brand-50/30 rounded p-6 text-center transition-colors"
              >
                <FileSpreadsheet className="h-8 w-8 text-gray-500 mx-auto mb-2" aria-hidden="true" />
                <p className="text-sm font-medium text-gray-700">Sélectionner un fichier</p>
                <p className="text-xs text-gray-600 mt-1">Excel (.xlsx) ou CSV</p>
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
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
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
            <div className="p-10 flex flex-col items-center justify-center" aria-busy="true">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-500 border-t-transparent mb-3" />
              <p className="text-sm text-gray-700">Analyse en cours...</p>
            </div>
          </>
        )}

        {phase === 'preview' && result && (
          <>
            {renderHeader(`${result.total} ligne(s) lues`)}
            <ImportPreview
              result={result}
              activity={activity}
              error={error}
              isMissingConfirmed={isMissingConfirmed}
              onMissingConfirmedChange={setIsMissingConfirmed}
            />
            <div className="flex justify-end items-center gap-2 px-4 py-3 bg-gray-50 border-t border-gray-200">
              <button onClick={onClose} className="btn btn-default">
                Annuler
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={!canImport}
                className="btn btn-primary disabled:opacity-50 disabled:pointer-events-none"
              >
                <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
                Importer {result.valid.length} inscription{result.valid.length > 1 ? 's' : ''}
              </button>
            </div>
          </>
        )}

        {phase === 'importing' && (
          <>
            {renderHeader('Importation...')}
            <div className="p-10 flex flex-col items-center justify-center" aria-busy="true">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-500 border-t-transparent mb-3" />
              <p className="text-sm text-gray-700">Enregistrement en base...</p>
            </div>
          </>
        )}

        {phase === 'done' && (
          <>
            {renderHeader('Terminé')}
            <div className="p-8 text-center" role="status">
              <CheckCircle className="h-12 w-12 text-emerald-600 mx-auto mb-3" aria-hidden="true" />
              <p className="text-base font-semibold text-gray-900">
                {importedCount} inscription{importedCount > 1 ? 's' : ''} importée{importedCount > 1 ? 's' : ''}
              </p>
              {result && (result.duplicates.length > 0 || result.invalid.length > 0) && (
                <p className="text-xs text-gray-600 mt-2 inline-flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
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
