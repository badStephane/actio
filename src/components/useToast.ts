import { useCallback, useState } from 'react';
import { ToastVariant } from './Toast';

interface ToastState {
  open: boolean;
  variant: ToastVariant;
  message: string;
}

const CLOSED: ToastState = { open: false, variant: 'success', message: '' };

/** État de toast partagé par les écrans ; `closeToast` est stable (m6). */
export const useToast = () => {
  const [toast, setToast] = useState<ToastState>(CLOSED);

  const showToast = useCallback((variant: ToastVariant, message: string) => {
    setToast({ open: true, variant, message });
  }, []);

  const closeToast = useCallback(() => {
    setToast(prev => ({ ...prev, open: false }));
  }, []);

  return { toast, showToast, closeToast };
};
