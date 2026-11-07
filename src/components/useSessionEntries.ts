import { useCallback, useEffect, useState } from 'react';
import { Registration } from '../types';
import { getRegistrationById } from '../utils/storage';
import {
  SessionEntry,
  addSessionEntry,
  readSessionEntries,
  reconcileSessionEntries,
  writeSessionEntries,
} from './sessionEntries';

/** Saisies de la session (sessionStorage), réalignées sur la base à l'arrivée sur la page. */
export const useSessionEntries = () => {
  const [entries, setEntries] = useState<SessionEntry[]>(readSessionEntries);

  useEffect(() => {
    writeSessionEntries(entries);
  }, [entries]);

  useEffect(() => {
    const initial = readSessionEntries();
    if (initial.length === 0) return;
    let isCancelled = false;
    Promise.all(
      initial.map(async (e): Promise<[string, Registration | null]> => [e.id, (await getRegistrationById(e.id)) ?? null])
    )
      .then(pairs => {
        if (!isCancelled) setEntries(prev => reconcileSessionEntries(prev, new Map(pairs)));
      })
      .catch(() => {
        // Lecture impossible : le panneau garde les valeurs connues ; l'erreur de base
        // sera visible à l'enregistrement suivant.
      });
    return () => {
      isCancelled = true;
    };
  }, []);

  const addEntry = useCallback((entry: SessionEntry) => {
    setEntries(prev => addSessionEntry(prev, entry));
  }, []);

  return { entries, addEntry };
};
