/** Raccourci « Nouvelle inscription » (D22) : Ctrl+N (Cmd+N sous macOS), repli F2. */
export interface ShortcutKeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

export const NEW_REGISTRATION_SHORTCUT_LABEL = 'Ctrl+N';
/** Événement émis quand le raccourci est pressé sur la saisie : focus sur Nom, rien n'est effacé. */
export const FOCUS_LAST_NAME_EVENT = 'actio:focus-nom';

export const isNewRegistrationShortcut = (e: ShortcutKeyEvent): boolean => {
  if (e.altKey || e.shiftKey) return false;
  if (e.key === 'F2') return !e.ctrlKey && !e.metaKey;
  return (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n';
};

/** Le raccourci est ignoré quand une fenêtre modale est ouverte ou l'application verrouillée (D4). */
export const isShortcutBlocked = (doc: Document = document): boolean =>
  doc.querySelector('[aria-modal="true"], [inert]') !== null;
