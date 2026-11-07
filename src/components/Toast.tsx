import React, { useEffect, useRef, useState } from 'react';
import { CircleCheckBig, CircleExclamationPoint, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error';

interface ToastProps {
  open: boolean;
  variant: ToastVariant;
  message: string;
  duration?: number;
  onClose: () => void;
}

const SUCCESS_DURATION_MS = 3000;
const ERROR_DURATION_MS = 6000;
const EXIT_ANIMATION_MS = 150;

const Toast: React.FC<ToastProps> = ({
  open,
  variant,
  message,
  duration,
  onClose,
}) => {
  const effectiveDuration =
    duration ?? (variant === 'error' ? ERROR_DURATION_MS : SUCCESS_DURATION_MS);
  const [visible, setVisible] = useState(false);
  const [rendered, setRendered] = useState(false);
  // Le minuteur ne doit pas repartir quand le parent recrée onClose (m6).
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- montage avant l'animation d'entrée, refonte notée hors 2.2.0
      setRendered(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setVisible(true)));
      return;
    }
    setVisible(false);
    const timer = setTimeout(() => setRendered(false), EXIT_ANIMATION_MS);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => onCloseRef.current(), effectiveDuration);
    return () => clearTimeout(timer);
  }, [open, effectiveDuration, message]);

  if (!rendered) return null;

  const isError = variant === 'error';
  const Icon = isError ? CircleExclamationPoint : CircleCheckBig;
  const accent = isError ? 'border-l-4 border-red-500' : 'border-l-4 border-emerald-500';
  const iconClass = isError ? 'text-red-600' : 'text-emerald-600';

  return (
    <div
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      className={`fixed top-4 right-4 z-50 panel shadow-lg ${accent} flex items-start gap-2 pl-3 pr-2 py-2 min-w-[260px] max-w-sm transition-all duration-150 ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0'
      }`}
    >
      <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${iconClass}`} aria-hidden="true" />
      <p className="text-sm text-gray-700 flex-1">{message}</p>
      <button
        onClick={() => onCloseRef.current()}
        className="text-gray-500 hover:text-gray-700 transition-colors flex-shrink-0"
        aria-label="Fermer"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

export default Toast;
