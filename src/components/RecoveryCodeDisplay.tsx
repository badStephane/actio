import React, { useEffect, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface RecoveryCodeDisplayProps {
  code: string;
  acknowledged: boolean;
  onAcknowledgedChange: (value: boolean) => void;
}

const COPIED_FEEDBACK_MS = 2000;

/** Affichage unique d'un code de récupération généré (D2). */
const RecoveryCodeDisplay: React.FC<RecoveryCodeDisplayProps> = ({
  code,
  acknowledged,
  onAcknowledgedChange,
}) => {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timerRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyState('copied');
      window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => setCopyState('idle'), COPIED_FEEDBACK_MS);
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-700">
        Voici votre code de récupération. <b>Il ne sera affiché qu'une seule fois.</b> Notez-le
        sur papier et rangez-le en lieu sûr : il permet de retrouver l'accès si vous oubliez le
        mot de passe, et ne sert qu'une fois.
      </p>
      <div className="flex items-center gap-2">
        <output
          aria-label="Code de récupération"
          className="flex-1 text-center font-mono text-base font-semibold tracking-wider text-gray-900 bg-gray-50 border border-gray-300 rounded px-3 py-2 select-all"
        >
          {code}
        </output>
        <button type="button" onClick={handleCopy} className="btn btn-default">
          {copyState === 'copied' ? (
            <Check className="h-3.5 w-3.5 text-emerald-700" aria-hidden="true" />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {copyState === 'copied' ? 'Copié' : 'Copier'}
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {copyState === 'copied' ? 'Code copié dans le presse-papiers.' : ''}
      </p>
      {copyState === 'failed' && (
        <p role="alert" className="text-xs text-red-700">
          Copie impossible : recopiez le code à la main.
        </p>
      )}
      <label className="flex items-start gap-2 text-xs text-gray-800 cursor-pointer">
        <input
          type="checkbox"
          checked={acknowledged}
          onChange={(e) => onAcknowledgedChange(e.target.checked)}
          className="h-4 w-4 mt-px"
        />
        Je l'ai noté en lieu sûr.
      </label>
    </div>
  );
};

export default RecoveryCodeDisplay;
