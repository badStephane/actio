import React, { useEffect, useRef, useState } from 'react';
import { CalendarDays, X, CircleExclamationPoint, CircleCheckBig } from 'lucide-react';
import { Activity } from '../types';
import { addActivity, updateActivity } from '../utils/activities';

interface ActivityFormModalProps {
  open: boolean;
  activity: Activity | null;
  onClose: () => void;
  onSaved: () => void;
}

const COLOR_PALETTE = [
  '#2563B8', // bleu du logo (distinct du bleu ciel de Wave)
  '#65A30D', // vert tilleul (distinct du vert des Espèces)
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#ef4444', // red
  '#6366f1', // indigo
  '#6b7280', // gray
];

const ActivityFormModal: React.FC<ActivityFormModalProps> = ({ open, activity, onClose, onSaved }) => {
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLOR_PALETTE[0]);
  const [eventDate, setEventDate] = useState('');
  const [defaultAmount, setDefaultAmount] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (activity) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- réinitialisation de la modale à chaque ouverture, refonte notée hors 2.2.0
      setName(activity.name);
      setColor(activity.color);
      setEventDate(activity.eventDate ?? '');
      setDefaultAmount(activity.defaultAmount !== undefined ? String(activity.defaultAmount) : '');
    } else {
      setName('');
      setColor(COLOR_PALETTE[0]);
      setEventDate('');
      setDefaultAmount('');
    }
    setError(null);
    setSuccess(false);
    const t = setTimeout(() => nameRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open, activity]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Le nom de l'activité est requis.");
      return;
    }

    let amountNum: number | undefined;
    if (defaultAmount.trim()) {
      const parsed = parseFloat(defaultAmount.replace(',', '.'));
      if (Number.isNaN(parsed) || parsed < 0) {
        setError('Le montant par défaut doit être un nombre positif.');
        return;
      }
      amountNum = parsed;
    }

    setBusy(true);
    try {
      const payload = {
        name: name.trim(),
        color,
        eventDate: eventDate || undefined,
        defaultAmount: amountNum,
      };

      if (activity) {
        await updateActivity({ id: activity.id, ...payload });
      } else {
        await addActivity(payload);
      }
      setSuccess(true);
      setTimeout(() => {
        onSaved();
      }, 800);
    } catch (err) {
      console.error('Error saving activity:', err);
      setError("Erreur lors de l'enregistrement.");
    } finally {
      setBusy(false);
    }
  };

  const isEdit = activity !== null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="activity-form-title"
    >
      <div
        className="panel shadow-xl max-w-md w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-brand-600" />
            <h3 id="activity-form-title" className="text-sm font-semibold text-gray-800">
              {isEdit ? "Modifier l'activité" : 'Nouvelle activité'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="btn-icon -mr-2 text-ink-muted hover:text-ink hover:bg-gray-100"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {success ? (
          <div className="p-6 text-center">
            <CircleCheckBig className="h-10 w-10 text-emerald-500 mx-auto mb-2" />
            <p className="text-sm font-medium text-emerald-700">
              {isEdit ? 'Activité modifiée.' : 'Activité créée.'}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-4 space-y-3">
            <div>
              <label htmlFor="activity-name" className="block text-xs font-medium text-gray-600 mb-1">
                Nom <span className="text-red-500">*</span>
              </label>
              <input
                ref={nameRef}
                id="activity-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Pèlerinage de Popenguine 2026"
                className="input-field"
                disabled={busy}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Couleur</label>
              <div className="flex flex-wrap gap-1.5">
                {COLOR_PALETTE.map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`h-7 w-7 rounded-full border-2 transition-all ${
                      color === c ? 'border-gray-900 scale-110' : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Couleur ${c}`}
                    disabled={busy}
                  />
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="activity-date" className="block text-xs font-medium text-gray-600 mb-1">
                  Date de l'événement
                </label>
                <input
                  id="activity-date"
                  type="date"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="input-field"
                  disabled={busy}
                />
              </div>
              <div>
                <label htmlFor="activity-amount" className="block text-xs font-medium text-gray-600 mb-1">
                  Montant par défaut
                </label>
                <input
                  id="activity-amount"
                  type="number"
                  value={defaultAmount}
                  onChange={(e) => setDefaultAmount(e.target.value)}
                  min="0"
                  step="any"
                  placeholder="0"
                  className="input-field"
                  disabled={busy}
                />
              </div>
            </div>

            {error && (
              <div className="flex items-start gap-2 px-2 py-1.5 bg-red-50 border border-red-200 rounded-sm text-xs text-red-700">
                <CircleExclamationPoint className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
              <button type="button" onClick={onClose} className="btn btn-default" disabled={busy}>
                Annuler
              </button>
              <button
                type="submit"
                disabled={busy || !name.trim()}
                className="btn btn-primary disabled:opacity-50 disabled:pointer-events-none"
              >
                {busy ? 'Enregistrement...' : isEdit ? 'Mettre à jour' : 'Créer'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ActivityFormModal;
