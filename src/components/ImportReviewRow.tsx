import React from 'react';
import { Check, WandSparkles } from 'lucide-react';
import { Activity } from '../types';
import { SuspiciousRegistration } from '../utils/importReview';
import { formatAmount } from './uiFormat';
import { REASON_LABEL, formatIsoDate, hasSuggestion } from './importReviewModel';

const formatRawAmount = (n: number): string =>
  `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(n)} F`;

export type RowStatus = 'idle' | 'busy' | 'error';

interface ImportReviewRowProps {
  item: SuspiciousRegistration;
  activity?: Activity;
  status: RowStatus;
  errorText?: string;
  isLocked: boolean;
  onApply: (item: SuspiciousRegistration) => void;
  onKeep: (item: SuspiciousRegistration) => void;
}

const ImportReviewRow: React.FC<ImportReviewRowProps> = ({
  item, activity, status, errorText, isLocked, onApply, onKeep,
}) => {
  const r = item.registration;
  const fullName = `${r.lastName} ${r.firstName}`;
  const isBusy = status === 'busy';
  const showAmount = item.suggestedAmount !== undefined || item.originalAmount !== undefined;
  const showDate = item.suggestedDate !== undefined;

  return (
    <tr className="align-top">
      <td className="px-3 py-2">
        <div className="font-medium text-gray-900">{fullName}</div>
        <div className="text-gray-600">{activity?.name ?? 'Activité inconnue'}</div>
        <div className="text-xs text-gray-600">Lot importé de {item.batchSize} lignes</div>
      </td>
      <td className="px-3 py-2">
        <ul className="space-y-0.5 text-gray-800">
          {item.reasons.map(reason => <li key={reason}>{REASON_LABEL[reason]}</li>)}
        </ul>
      </td>
      <td className="px-3 py-2 tabular-nums text-gray-800 whitespace-nowrap">
        {showAmount && <div>{formatAmount(r.amount)}</div>}
        {item.originalAmount !== undefined && (
          <div className="text-xs text-gray-600">lu à l'import : {formatRawAmount(item.originalAmount)}</div>
        )}
        {showDate && <div>{formatIsoDate(r.registrationDate)}</div>}
      </td>
      <td className="px-3 py-2 tabular-nums font-medium text-gray-900 whitespace-nowrap">
        {item.suggestedAmount !== undefined && <div>{formatAmount(item.suggestedAmount)}</div>}
        {showAmount && item.suggestedAmount === undefined && <div className="font-normal text-gray-600">·</div>}
        {item.suggestedDate !== undefined && <div>{formatIsoDate(item.suggestedDate)}</div>}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1 justify-end">
          {hasSuggestion(item) && (
            <button
              type="button"
              onClick={() => onApply(item)}
              disabled={isBusy || isLocked}
              aria-label={`Appliquer la suggestion pour ${fullName}`}
              className="btn btn-primary disabled:opacity-50 disabled:pointer-events-none"
            >
              <WandSparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Appliquer la suggestion
            </button>
          )}
          <button
            type="button"
            onClick={() => onKeep(item)}
            disabled={isBusy || isLocked}
            aria-label={`Valeurs correctes pour ${fullName}`}
            className="btn btn-default disabled:opacity-50 disabled:pointer-events-none"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            C'est correct
          </button>
        </div>
        {status === 'error' && errorText && (
          <p role="alert" className="mt-1 text-xs text-red-700 text-right">{errorText}</p>
        )}
      </td>
    </tr>
  );
};

export default ImportReviewRow;
