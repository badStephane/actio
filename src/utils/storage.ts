import { Registration } from '../types';
import { getDb } from './db';
import { logEvent, logSystemEvent } from './audit';
import { DEMO_MODE, demoRegistrations } from './demo';
import { parseAmountXof } from './amount';
import { isValidIsoDate } from './dates';
import { personKey } from './phone';

/** Règles appliquées à toute écriture, quel que soit l'écran (D1 : entier >= 0 ; date réelle). */
const assertRegistration = (r: Pick<Registration, 'amount' | 'registrationDate'>): void => {
  if (parseAmountXof(r.amount) === null) {
    throw new Error('Montant invalide : entier positif ou nul, en francs CFA.');
  }
  if (!isValidIsoDate(r.registrationDate)) {
    throw new Error("Date d'inscription invalide.");
  }
};

const formatRegistrationSummary = (r: Pick<Registration, 'lastName' | 'firstName' | 'amount'>): string =>
  `${r.lastName} ${r.firstName} · ${new Intl.NumberFormat('fr-FR').format(r.amount)} F`;

interface Row {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  address: string;
  registration_date: string;
  payment_type: 'wave' | 'cash' | 'orange_money';
  amount: number;
  activity_id: string;
  created_at: number;
}

const COLUMNS =
  'id, first_name, last_name, phone, address, registration_date, payment_type, amount, activity_id, created_at';

const rowToRegistration = (r: Row): Registration => ({
  id: r.id,
  firstName: r.first_name,
  lastName: r.last_name,
  phone: r.phone,
  address: r.address,
  registrationDate: r.registration_date,
  paymentType: r.payment_type,
  amount: r.amount,
  activityId: r.activity_id,
  createdAt: r.created_at,
});

export const getRegistrations = async (): Promise<Registration[]> => {
  if (DEMO_MODE) return [...demoRegistrations].sort((a, b) => b.createdAt - a.createdAt);
  const db = await getDb();
  const rows = await db.select<Row[]>(
    `SELECT ${COLUMNS} FROM registrations ORDER BY created_at DESC`
  );
  return rows.map(rowToRegistration);
};

export const getRegistrationById = async (id: string): Promise<Registration | null> => {
  if (DEMO_MODE) return demoRegistrations.find((r) => r.id === id) ?? null;
  const db = await getDb();
  const rows = await db.select<Row[]>(
    `SELECT ${COLUMNS} FROM registrations WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows.length > 0 ? rowToRegistration(rows[0]) : null;
};

/**
 * Doublon probable dans une activité (D9 : avertissement seulement) : même nom, même prénom
 * (casse et accents ignorés) et même clé téléphone (9 derniers chiffres).
 */
export const findDuplicateRegistration = async (
  activityId: string,
  lastName: string,
  firstName: string,
  phone: string,
  excludeId?: string
): Promise<Registration | null> => {
  const target = personKey(lastName, firstName, phone);
  const isSame = (r: Registration): boolean =>
    r.id !== excludeId && personKey(r.lastName, r.firstName, r.phone) === target;
  if (DEMO_MODE) {
    return demoRegistrations.find((r) => r.activityId === activityId && isSame(r)) ?? null;
  }
  const db = await getDb();
  const rows = await db.select<Row[]>(
    `SELECT ${COLUMNS} FROM registrations WHERE activity_id = $1`,
    [activityId]
  );
  return rows.map(rowToRegistration).find(isSame) ?? null;
};

export const addRegistration = async (
  registration: Omit<Registration, 'id' | 'createdAt'>
): Promise<Registration> => {
  assertRegistration(registration);
  const newRegistration: Registration = {
    ...registration,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };
  if (DEMO_MODE) {
    demoRegistrations.push(newRegistration);
    await logEvent('created', 'registration', newRegistration.id, formatRegistrationSummary(newRegistration));
    return newRegistration;
  }
  const db = await getDb();
  await db.execute(
    `INSERT INTO registrations (${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      newRegistration.id,
      newRegistration.firstName,
      newRegistration.lastName,
      newRegistration.phone,
      newRegistration.address,
      newRegistration.registrationDate,
      newRegistration.paymentType,
      newRegistration.amount,
      newRegistration.activityId,
      newRegistration.createdAt,
    ]
  );
  await logEvent('created', 'registration', newRegistration.id, formatRegistrationSummary(newRegistration));
  return newRegistration;
};

export const updateRegistration = async (
  registration: Omit<Registration, 'createdAt'>
): Promise<void> => {
  assertRegistration(registration);
  if (DEMO_MODE) {
    const i = demoRegistrations.findIndex((r) => r.id === registration.id);
    if (i !== -1) demoRegistrations[i] = { ...demoRegistrations[i], ...registration };
    await logEvent('updated', 'registration', registration.id, formatRegistrationSummary(registration));
    return;
  }
  const db = await getDb();
  await db.execute(
    `UPDATE registrations SET
       first_name = $1,
       last_name = $2,
       phone = $3,
       address = $4,
       registration_date = $5,
       payment_type = $6,
       amount = $7,
       activity_id = $8
     WHERE id = $9`,
    [
      registration.firstName,
      registration.lastName,
      registration.phone,
      registration.address,
      registration.registrationDate,
      registration.paymentType,
      registration.amount,
      registration.activityId,
      registration.id,
    ]
  );
  await logEvent('updated', 'registration', registration.id, formatRegistrationSummary(registration));
};

export const deleteRegistration = async (id: string): Promise<void> => {
  if (DEMO_MODE) {
    const i = demoRegistrations.findIndex((r) => r.id === id);
    const before = i !== -1 ? demoRegistrations[i] : null;
    if (i !== -1) demoRegistrations.splice(i, 1);
    if (before) await logEvent('deleted', 'registration', id, formatRegistrationSummary(before));
    return;
  }
  const db = await getDb();
  const before = await getRegistrationById(id);
  await db.execute('DELETE FROM registrations WHERE id = $1', [id]);
  if (before) {
    await logEvent('deleted', 'registration', id, formatRegistrationSummary(before));
  }
};

/**
 * Import en masse ATOMIQUE : une seule instruction INSERT ... SELECT FROM json_each($1).
 * En SQLite une instruction s'exécute dans sa propre transaction implicite : si une ligne viole
 * une contrainte (montant, clé étrangère...), aucune ligne n'est insérée. Contrairement à
 * BEGIN / INSERT / COMMIT envoyés séparément, cela ne dépend pas de la connexion du pool
 * sqlx qui exécute chaque appel.
 */
const BULK_INSERT_SQL = `INSERT INTO registrations (${COLUMNS})
  SELECT json_extract(value, '$.id'), json_extract(value, '$.firstName'), json_extract(value, '$.lastName'),
         json_extract(value, '$.phone'), json_extract(value, '$.address'), json_extract(value, '$.registrationDate'),
         json_extract(value, '$.paymentType'), json_extract(value, '$.amount'), json_extract(value, '$.activityId'),
         json_extract(value, '$.createdAt')
  FROM json_each($1)`;

const importSummary = (regs: Registration[]): { count: number; totalAmount: number; activityIds: string[] } => ({
  count: regs.length,
  totalAmount: regs.reduce((sum, r) => sum + r.amount, 0),
  activityIds: [...new Set(regs.map((r) => r.activityId))],
});

export const addRegistrationsBulk = async (
  registrations: Omit<Registration, 'id' | 'createdAt'>[]
): Promise<Registration[]> => {
  if (registrations.length === 0) return [];
  registrations.forEach(assertRegistration);
  const now = Date.now();
  const inserted: Registration[] = registrations.map((reg) => ({
    ...reg,
    id: crypto.randomUUID(),
    createdAt: now,
  }));
  const summary = importSummary(inserted);
  const label = `Import de ${summary.count} inscription(s) · ${new Intl.NumberFormat('fr-FR').format(summary.totalAmount)} F`;
  if (DEMO_MODE) {
    demoRegistrations.push(...inserted);
    await logSystemEvent('imported', label, summary);
    return inserted;
  }
  const db = await getDb();
  await db.execute(BULK_INSERT_SQL, [JSON.stringify(inserted)]);
  try {
    await logSystemEvent('imported', label, summary);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Les ${summary.count} inscriptions ont bien été importées, mais l'historique n'a pas pu être écrit (${msg}). Ne relancez pas l'import.`,
      { cause: error }
    );
  }
  return inserted;
};
