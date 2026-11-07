import { invoke } from '@tauri-apps/api/core';
import { DEMO_MODE } from './demo';

/**
 * Sauvegarde, restauration et réinitialisation passent par des commandes Rust
 * (src-tauri/src/commands.rs) : les boîtes de dialogue s'ouvrent côté Rust, l'instantané
 * est cohérent (VACUUM INTO) et la restauration valide puis met à niveau le fichier
 * avant de remplacer la base, puis redémarre l'application.
 */

export interface AutoBackup {
  name: string;
  createdAt: number;
  sizeBytes: number;
}

/** Emplacement des sauvegardes automatiques, à afficher tel quel. */
export const BACKUP_DIR_LABEL = "dossier de l'application / backups";

const DEMO_ERROR = 'Indisponible en mode démonstration.';

const assertDesktop = (): void => {
  if (DEMO_MODE) throw new Error(DEMO_ERROR);
};

/** Les commandes Rust rejettent avec un message en français (string) : on le remonte en Error. */
const call = async <T>(command: string): Promise<T> => {
  try {
    return await invoke<T>(command);
  } catch (error) {
    throw new Error(typeof error === 'string' ? error : error instanceof Error ? error.message : String(error), {
      cause: error,
    });
  }
};

/** false = annulé par l'utilisateur. */
export const exportDatabase = async (): Promise<boolean> => {
  assertDesktop();
  const path = await call<string | null>('export_database');
  return path !== null;
};

/**
 * false = annulé. Lève une Error (message FR) si le fichier est invalide.
 * En cas de succès : sauvegarde automatique de la base actuelle, remplacement, puis
 * redémarrage de l'application (la promesse peut ne jamais se résoudre).
 */
export const restoreDatabase = async (): Promise<boolean> => {
  assertDesktop();
  return call<boolean>('restore_database');
};

/**
 * Sauvegarde automatique, purge (inscriptions, contacts, historique, activités sauf
 * l'activité par défaut, mot de passe), événement `reset`, puis redémarrage.
 */
export const resetAppData = async (): Promise<void> => {
  assertDesktop();
  await call<void>('reset_app_data');
};

export const listAutoBackups = async (): Promise<AutoBackup[]> => {
  assertDesktop();
  return call<AutoBackup[]>('list_auto_backups');
};
