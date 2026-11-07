import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  /** Action en cours : Confirmer désactivé, fermeture bloquée (m3). */
  busy?: boolean;
  busyLabel?: string;
  /** Mot à saisir pour activer Confirmer (ex. « EFFACER »). */
  confirmText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const ANIMATION_MS = 150;
const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  variant = 'default',
  busy = false,
  busyLabel = 'En cours...',
  confirmText,
  onConfirm,
  onCancel,
}) => {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const typedRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);
  const [typed, setTyped] = useState('');

  // Mémorise le déclencheur à l'ouverture, lui rend le focus à la fermeture.
  useEffect(() => {
    if (open) {
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- montage avant l'animation d'entrée, refonte notée hors 2.2.0
      setTyped('');
      setRendered(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      const t = setTimeout(() => (typedRef.current ?? cancelRef.current)?.focus(), 50);
      return () => clearTimeout(t);
    }
    setVisible(false);
    const target = returnFocusRef.current;
    if (target && document.contains(target)) target.focus();
    returnFocusRef.current = null;
    const timer = setTimeout(() => setRendered(false), ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!busy) onCancel();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusable = dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onCancel, busy]);

  if (!rendered) return null;

  const isTypedOk = !confirmText || typed.trim().toUpperCase() === confirmText;
  const isConfirmDisabled = busy || !isTypedOk;
  const confirmBtnClass = variant === 'danger' ? 'btn btn-danger' : 'btn btn-primary';

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity duration-150 ${
        visible ? 'bg-black/40 opacity-100' : 'bg-black/0 opacity-0'
      }`}
      onClick={() => !busy && onCancel()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      aria-describedby="confirm-modal-message"
    >
      <div
        ref={dialogRef}
        className={`panel shadow-xl max-w-md w-full mx-4 overflow-hidden transition-all duration-150 ${
          visible ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-4 py-3 border-b border-gray-200">
          <div className="flex items-center gap-2 min-w-0">
            {variant === 'danger' && (
              <AlertTriangle className="h-4 w-4 text-red-600 flex-shrink-0" aria-hidden="true" />
            )}
            <h3 id="confirm-modal-title" className="text-sm font-semibold text-gray-800 truncate">
              {title}
            </h3>
          </div>
          <button
            onClick={onCancel}
            disabled={busy}
            className="text-gray-500 hover:text-gray-700 transition-colors flex-shrink-0 ml-2 disabled:opacity-50"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div id="confirm-modal-message" className="px-4 py-3 text-sm text-gray-600 space-y-2">
          {message}
        </div>

        {confirmText && (
          <div className="px-4 pb-3">
            <label htmlFor="confirm-modal-typed" className="block text-xs font-medium text-gray-700 mb-1">
              Tapez <b>{confirmText}</b> pour confirmer
            </label>
            <input
              ref={typedRef}
              id="confirm-modal-typed"
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={busy}
              className="input-field"
            />
          </div>
        )}

        <div className="flex justify-end gap-2 px-4 py-3 bg-gray-50 border-t border-gray-200">
          <button ref={cancelRef} onClick={onCancel} disabled={busy} className="btn btn-default">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={isConfirmDisabled}
            aria-busy={busy}
            className={`${confirmBtnClass} disabled:opacity-50 disabled:pointer-events-none`}
          >
            {busy ? busyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
