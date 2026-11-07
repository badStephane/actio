import { getDb } from './db';
import { logSystemEvent } from './audit';

const ITERATIONS = 100_000;
const SALT_BYTES = 16;
const HASH_BITS = 256;

/** Longueur minimale des NOUVEAUX mots de passe (les anciens restent valides). */
export const MIN_PASSWORD_LENGTH = 8;

/** Échecs autorisés avant blocage, puis attente doublée à chaque échec (30 s, 1 min, 2 min…, 15 min max). */
export const MAX_FREE_ATTEMPTS = 5;
export const BASE_LOCK_MS = 30_000;
export const MAX_LOCK_MS = 15 * 60_000;

/** Alphabet du code de récupération : 32 signes sans I, O, 0, 1 (ambigus à la lecture). */
export const RECOVERY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECOVERY_LENGTH = 16; // 16 x 5 bits = 80 bits
const RECOVERY_GROUP = 4;

export type VerifyResult = { ok: true } | { ok: false; retryAfterMs: number; attemptsLeft?: number };

interface AuthRow {
  password_hash: string;
  salt: string;
  iterations: number;
  recovery_hash: string | null;
  recovery_salt: string | null;
  recovery_iterations: number | null;
  failed_attempts: number;
  locked_until: number | null;
}

const toBase64 = (bytes: Uint8Array): string => {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
};

const fromBase64 = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};

const constantTimeEqual = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

const derive = async (
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number
): Promise<string> => {
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    passwordKey,
    HASH_BITS
  );
  return toBase64(new Uint8Array(bits));
};

const getAuthRow = async (): Promise<AuthRow | null> => {
  const db = await getDb();
  const rows = await db.select<AuthRow[]>(
    `SELECT password_hash, salt, iterations, recovery_hash, recovery_salt, recovery_iterations,
            failed_attempts, locked_until
       FROM auth_settings WHERE id = 1 LIMIT 1`
  );
  return rows.length > 0 ? rows[0] : null;
};

const hashSecret = async (secret: string): Promise<{ hash: string; salt: string }> => {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  return { hash: await derive(secret, salt, ITERATIONS), salt: toBase64(salt) };
};

const matches = async (secret: string, hash: string, salt: string, iterations: number): Promise<boolean> =>
  constantTimeEqual(await derive(secret, fromBase64(salt), iterations), hash);

const assertNewPassword = (password: string): void => {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`);
  }
};

/** Durée de blocage après n échecs consécutifs (0 tant que n < MAX_FREE_ATTEMPTS). */
export const lockDurationMs = (failedAttempts: number): number => {
  if (failedAttempts < MAX_FREE_ATTEMPTS) return 0;
  const exponent = Math.min(failedAttempts - MAX_FREE_ATTEMPTS, 10);
  return Math.min(BASE_LOCK_MS * 2 ** exponent, MAX_LOCK_MS);
};

/** Erreur si la base est illisible : jamais false par défaut (sinon l'app proposerait d'écraser le mot de passe). */
export const hasPassword = async (): Promise<boolean> => (await getAuthRow()) !== null;

/** Premier mot de passe. Échoue si un mot de passe existe déjà (ne l'écrase jamais). */
export const createInitialPassword = async (password: string): Promise<void> => {
  assertNewPassword(password);
  const { hash, salt } = await hashSecret(password);
  const db = await getDb();
  try {
    await db.execute(
      `INSERT INTO auth_settings (id, password_hash, salt, iterations, created_at, failed_attempts)
       VALUES (1, $1, $2, $3, $4, 0)`,
      [hash, salt, ITERATIONS, Date.now()]
    );
  } catch (error) {
    if (/UNIQUE|PRIMARY KEY/i.test(error instanceof Error ? error.message : String(error))) {
      throw new Error('Un mot de passe existe déjà.', { cause: error });
    }
    throw error;
  }
  await logSystemEvent('password_changed', 'Mot de passe défini');
};

/** Change le mot de passe (UPDATE) : le code de récupération est conservé, le compteur remis à zéro. */
export const updatePassword = async (password: string): Promise<void> => {
  assertNewPassword(password);
  const { hash, salt } = await hashSecret(password);
  const db = await getDb();
  const result = await db.execute(
    `UPDATE auth_settings
        SET password_hash = $1, salt = $2, iterations = $3, failed_attempts = 0, locked_until = NULL
      WHERE id = 1`,
    [hash, salt, ITERATIONS]
  );
  if (result.rowsAffected !== 1) throw new Error("Aucun mot de passe n'est défini.");
  await logSystemEvent('password_changed', 'Mot de passe modifié');
};

const lockedResult = (row: AuthRow, now: number): VerifyResult | null =>
  row.locked_until !== null && row.locked_until > now
    ? { ok: false, retryAfterMs: row.locked_until - now, attemptsLeft: 0 }
    : null;

/** Échec commun au mot de passe et au code : incrément atomique, puis blocage éventuel. */
const registerFailure = async (): Promise<VerifyResult> => {
  const db = await getDb();
  await db.execute('UPDATE auth_settings SET failed_attempts = failed_attempts + 1 WHERE id = 1');
  const rows = await db.select<{ failed_attempts: number }[]>(
    'SELECT failed_attempts FROM auth_settings WHERE id = 1'
  );
  const failures = rows[0]?.failed_attempts ?? MAX_FREE_ATTEMPTS;
  const lockMs = lockDurationMs(failures);
  if (lockMs > 0) {
    await db.execute('UPDATE auth_settings SET locked_until = $1 WHERE id = 1', [Date.now() + lockMs]);
  }
  return { ok: false, retryAfterMs: lockMs, attemptsLeft: Math.max(0, MAX_FREE_ATTEMPTS - failures) };
};

const resetFailures = async (row: AuthRow): Promise<void> => {
  if (row.failed_attempts === 0 && row.locked_until === null) return;
  const db = await getDb();
  await db.execute('UPDATE auth_settings SET failed_attempts = 0, locked_until = NULL WHERE id = 1');
};

export const verifyPassword = async (password: string): Promise<VerifyResult> => {
  const row = await getAuthRow();
  if (!row) return { ok: false, retryAfterMs: 0 };
  const locked = lockedResult(row, Date.now());
  if (locked) return locked;
  if (!(await matches(password, row.password_hash, row.salt, row.iterations))) return registerFailure();
  await resetFailures(row);
  return { ok: true };
};

export const hasRecoveryCode = async (): Promise<boolean> => {
  const row = await getAuthRow();
  return row !== null && row.recovery_hash !== null && row.recovery_hash !== '';
};

/** Majuscules, sans espaces ni tirets : « abcd-efgh » et « ABCDEFGH » sont équivalents. */
export const normalizeRecoveryCode = (code: string): string => code.toUpperCase().replace(/[\s-]/g, '');

const formatRecoveryCode = (raw: string): string =>
  (raw.match(new RegExp(`.{1,${RECOVERY_GROUP}}`, 'g')) ?? []).join('-');

/**
 * Génère un code (80 bits, ex. « ABCD-EFGH-JKLM-NPQR »), le stocke haché et le renvoie UNE seule fois.
 * Remplace le code précédent. 256 est multiple de 32 : le tirage est uniforme.
 */
export const generateRecoveryCode = async (): Promise<string> => {
  const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_LENGTH));
  const raw = Array.from(bytes, (b) => RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length]).join('');
  const { hash, salt } = await hashSecret(raw);
  const db = await getDb();
  const result = await db.execute(
    'UPDATE auth_settings SET recovery_hash = $1, recovery_salt = $2, recovery_iterations = $3 WHERE id = 1',
    [hash, salt, ITERATIONS]
  );
  if (result.rowsAffected !== 1) throw new Error("Définissez d'abord un mot de passe.");
  return formatRecoveryCode(raw);
};

/**
 * Vérifie le code (même compteur d'échecs que le mot de passe). En cas de succès le code est
 * CONSOMMÉ (D2) : l'appelant doit faire définir un nouveau mot de passe puis générer un nouveau code.
 * Les codes choisis avant la 2.1.0 (enregistrés tels quels, après trim) restent acceptés.
 */
export const verifyRecoveryCode = async (code: string): Promise<VerifyResult> => {
  const row = await getAuthRow();
  if (!row || !row.recovery_hash || !row.recovery_salt || !row.recovery_iterations) {
    return { ok: false, retryAfterMs: 0 };
  }
  const locked = lockedResult(row, Date.now());
  if (locked) return locked;
  const { recovery_hash: hash, recovery_salt: salt, recovery_iterations: iterations } = row;
  const ok =
    (await matches(normalizeRecoveryCode(code), hash, salt, iterations)) ||
    (await matches(code.trim(), hash, salt, iterations));
  if (!ok) return registerFailure();
  const db = await getDb();
  await db.execute(
    `UPDATE auth_settings
        SET recovery_hash = NULL, recovery_salt = NULL, recovery_iterations = NULL,
            failed_attempts = 0, locked_until = NULL
      WHERE id = 1`
  );
  await logSystemEvent('recovery_used', 'Déverrouillage par code de récupération (code consommé)');
  return { ok: true };
};

export const clearRecoveryCode = async (): Promise<void> => {
  const db = await getDb();
  await db.execute(
    'UPDATE auth_settings SET recovery_hash = NULL, recovery_salt = NULL, recovery_iterations = NULL WHERE id = 1'
  );
};
