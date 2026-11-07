import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ToastVariant } from './Toast';

/** Message transmis par `navigate(..., { state: { flash } })`, affiché une fois puis retiré de l'historique. */
export const useFlashToast = (showToast: (variant: ToastVariant, message: string) => void): void => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const flash = (location.state as { flash?: unknown } | null)?.flash;
    if (typeof flash !== 'string' || !flash) return;
    showToast('success', flash);
    navigate(`${location.pathname}${location.search}`, { replace: true, state: null });
  }, [location, navigate, showToast]);
};
