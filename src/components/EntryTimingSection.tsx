import React, { useState } from 'react';
import { Timer } from 'lucide-react';
import {
  clearTimingSamples,
  formatDuration,
  isTimingEnabled,
  median,
  readTimingSamples,
  setTimingEnabled,
} from './entryTiming';

/** Préférence « Mesurer mes temps de saisie » (D22) : locale, désactivée par défaut, jamais transmise. */
const EntryTimingSection: React.FC = () => {
  const [isEnabled, setIsEnabled] = useState(isTimingEnabled);
  const [samples, setSamples] = useState<number[]>(readTimingSamples);
  const medianMs = median(samples);

  const toggle = (enabled: boolean) => {
    setTimingEnabled(enabled);
    setIsEnabled(enabled);
  };

  const clear = () => {
    clearTimingSamples();
    setSamples([]);
  };

  return (
    <section aria-labelledby="timing-title" className="border-t border-gray-200 pt-4">
      <div className="flex items-center gap-2 mb-1">
        <Timer className="h-4 w-4 text-ink-muted" aria-hidden="true" />
        <h4 id="timing-title" className="text-sm font-semibold text-ink">Temps de saisie</h4>
      </div>
      <label className="flex items-start gap-2 min-h-[24px] cursor-pointer text-sm text-ink">
        <input
          type="checkbox"
          checked={isEnabled}
          onChange={(e) => toggle(e.target.checked)}
          aria-describedby="timing-help"
          className="mt-0.5 h-4 w-4 accent-brand-600"
        />
        Mesurer mes temps de saisie
      </label>
      <p id="timing-help" className="mt-1 text-sm text-ink-muted">
        Mesure, sur ce poste uniquement, le temps entre la première lettre tapée et l'enregistrement.
        Rien n'est envoyé.
      </p>
      <p className="mt-2 text-sm text-ink" aria-live="polite">
        {medianMs === null
          ? 'Aucune mesure pour le moment.'
          : <>Temps médian : <b className="tabular-nums">{formatDuration(medianMs)}</b> sur {samples.length} saisie{samples.length > 1 ? 's' : ''}.</>}
      </p>
      {samples.length > 0 && (
        <button type="button" onClick={clear} className="btn btn-default mt-2">
          Effacer les mesures
        </button>
      )}
    </section>
  );
};

export default EntryTimingSection;
