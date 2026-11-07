import React from 'react';
import { AlertCircle, AlertTriangle, BookUser } from 'lucide-react';
import { Activity } from '../types';
import { ParseResult, ParsedRow } from '../utils/importRegistrations';
import { formatAmount } from './uiFormat';
import { paymentLabel } from './paymentMeta';

type MissingColumn = ParseResult['missingColumns'][number];

const PREVIEW_LIMIT = 50;
const ERROR_LIMIT = 50;

/** Lignes importées dont l'adresse vient du carnet (D19). */
const countAddressesFromContacts = (result: ParseResult): number =>
  result.valid.filter(r => r.addressFromContacts).length;

const missingColumnText = (column: MissingColumn, activity: Activity): string => {
  switch (column) {
    case 'amount':
      return `Montant : chaque ligne prendra le montant par défaut de l'activité (${formatAmount(activity.defaultAmount ?? 0)}).`;
    case 'paymentType':
      return 'Mode de paiement : chaque ligne sera enregistrée en « Espèces ».';
    case 'registrationDate':
      return 'Date d\'inscription : chaque ligne prendra la date du jour.';
  }
};

const rowErrors = (r: ParsedRow): string[] => {
  if (r.errors && r.errors.length > 0) return r.errors;
  return r.error ? [r.error] : [];
};

interface ImportPreviewProps {
  result: ParseResult;
  activity: Activity;
  error: string | null;
  isMissingConfirmed: boolean;
  onMissingConfirmedChange: (value: boolean) => void;
}

const SummaryCard: React.FC<{ label: string; value: string; tone: string }> = ({ label, value, tone }) => (
  <div className={`panel px-3 py-2 border-l-2 ${tone}`}>
    <div className="text-xs font-medium text-gray-700">{label}</div>
    <div className="text-base font-semibold text-gray-900 tabular-nums mt-0.5">{value}</div>
  </div>
);

/** Aperçu avant import (QA-03) : colonnes manquantes, montants lus, total, erreurs par ligne. */
const ImportPreview: React.FC<ImportPreviewProps> = ({
  result,
  activity,
  error,
  isMissingConfirmed,
  onMissingConfirmedChange,
}) => (
  <div className="flex-1 overflow-auto">
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 border-b border-gray-200 bg-gray-50">
      <SummaryCard label="À importer" value={String(result.valid.length)} tone="border-l-emerald-500" />
      <SummaryCard label="Total lu" value={formatAmount(result.totalAmount)} tone="border-l-brand-500" />
      <SummaryCard label="Doublons" value={String(result.duplicates.length)} tone="border-l-amber-500" />
      <SummaryCard label="Erreurs" value={String(result.invalid.length)} tone="border-l-red-500" />
    </div>

    <div className="px-4 py-3 space-y-3">
      {error && (
        <div role="alert" className="flex items-start gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {result.missingColumns.length > 0 && (
        <div role="alert" className="px-3 py-2 bg-amber-50 border border-amber-300 rounded text-xs text-amber-900 space-y-2">
          <p className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            Colonnes attendues introuvables dans le fichier
          </p>
          <ul className="list-disc pl-5 space-y-0.5">
            {result.missingColumns.map(c => <li key={c}>{missingColumnText(c, activity)}</li>)}
          </ul>
          <label className="flex items-start gap-2 cursor-pointer font-medium">
            <input
              type="checkbox"
              checked={isMissingConfirmed}
              onChange={(e) => onMissingConfirmedChange(e.target.checked)}
              className="h-4 w-4 mt-px"
            />
            J'ai vérifié : ces valeurs par défaut sont correctes pour ce fichier.
          </label>
        </div>
      )}

      {countAddressesFromContacts(result) > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-gray-700">
          <BookUser className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {countAddressesFromContacts(result)} adresse(s) vide(s) reprise(s) du carnet de contacts.
        </p>
      )}
      {result.contactLookupFailed && (
        <p role="status" className="text-xs text-amber-900">
          Carnet de contacts illisible : les adresses vides restent vides (elles sont facultatives).
        </p>
      )}

      {result.unrecognizedHeaders.length > 0 && (
        <p className="text-xs text-gray-700">
          <b>Colonnes ignorées</b> (non reconnues) : {result.unrecognizedHeaders.join(', ')}
        </p>
      )}

      {result.valid.length > 0 && (
        <details open className="text-xs">
          <summary className="cursor-pointer text-emerald-800 font-medium mb-1">
            Aperçu des inscriptions valides ({result.valid.length})
          </summary>
          <div className="overflow-x-auto mt-2 border border-gray-200 rounded max-h-64">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium text-gray-700">Ligne</th>
                  <th className="text-left px-2 py-1.5 font-medium text-gray-700">Nom Prénoms</th>
                  <th className="text-left px-2 py-1.5 font-medium text-gray-700">Téléphone</th>
                  <th className="text-left px-2 py-1.5 font-medium text-gray-700">Adresse</th>
                  <th className="text-right px-2 py-1.5 font-medium text-gray-700">Montant lu</th>
                  <th className="text-left px-2 py-1.5 font-medium text-gray-700">Mode de paiement</th>
                  <th className="text-left px-2 py-1.5 font-medium text-gray-700">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {result.valid.slice(0, PREVIEW_LIMIT).map(r => (
                  <tr key={r.rowNumber}>
                    <td className="px-2 py-1.5 text-gray-600 tabular-nums">{r.rowNumber}</td>
                    <td className="px-2 py-1.5 text-gray-900">{r.data?.lastName} {r.data?.firstName}</td>
                    <td className="px-2 py-1.5 text-gray-700 tabular-nums">{r.data?.phone}</td>
                    <td className="px-2 py-1.5 text-gray-700">
                      {r.data?.address}
                      {r.addressFromContacts && (
                        <span className="block text-gray-600 italic">adresse reprise du carnet</span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-right text-gray-900 tabular-nums">{formatAmount(r.amount)}</td>
                    <td className="px-2 py-1.5 text-gray-700">{r.data ? paymentLabel(r.data.paymentType) : ''}</td>
                    <td className="px-2 py-1.5 text-gray-700 tabular-nums">{r.data?.registrationDate}</td>
                  </tr>
                ))}
                {result.valid.length > PREVIEW_LIMIT && (
                  <tr>
                    <td colSpan={7} className="px-2 py-1.5 text-gray-600 italic text-center">
                      ...et {result.valid.length - PREVIEW_LIMIT} autre(s), comprises dans le total
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
          <summary className="cursor-pointer text-amber-800 font-medium">
            Doublons ignorés ({result.duplicates.length})
          </summary>
          <ul className="mt-2 space-y-1 text-gray-700">
            {result.duplicates.slice(0, ERROR_LIMIT).map(r => (
              <li key={r.rowNumber} className="flex gap-2">
                <span className="text-gray-600 tabular-nums">L.{r.rowNumber}</span>
                <span>{r.data?.lastName} {r.data?.firstName} · {r.data?.phone}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {result.invalid.length > 0 && (
        <details open className="text-xs">
          <summary className="cursor-pointer text-red-800 font-medium">
            Lignes en erreur, non importées ({result.invalid.length})
          </summary>
          <ul className="mt-2 space-y-1 text-gray-800">
            {result.invalid.slice(0, ERROR_LIMIT).map(r => (
              <li key={r.rowNumber} className="flex gap-2">
                <span className="text-gray-600 tabular-nums flex-shrink-0">L.{r.rowNumber}</span>
                <span>{rowErrors(r).join(' ; ')}</span>
              </li>
            ))}
            {result.invalid.length > ERROR_LIMIT && (
              <li className="text-gray-600 italic">...et {result.invalid.length - ERROR_LIMIT} autre(s)</li>
            )}
          </ul>
        </details>
      )}
    </div>
  </div>
);

export default ImportPreview;
