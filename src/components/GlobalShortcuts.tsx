import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FOCUS_LAST_NAME_EVENT, isNewRegistrationShortcut, isShortcutBlocked } from './shortcuts';

/**
 * Ctrl+N / F2 (Lot 1, 1.4) : ouvre la saisie ; déjà sur la saisie, remet le focus sur Nom
 * sans rien effacer. Ignoré en modification (une correction en cours n'est jamais perdue).
 */
function GlobalShortcuts(): null {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isNewRegistrationShortcut(e) || e.repeat) return;
      e.preventDefault();
      if (isShortcutBlocked() || pathname.startsWith('/edit/')) return;
      if (pathname === '/add') window.dispatchEvent(new Event(FOCUS_LAST_NAME_EVENT));
      else navigate('/add');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate, pathname]);

  return null;
}

export default GlobalShortcuts;
