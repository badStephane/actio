import { Registration } from '../types';
import { getDb } from './db';
import { logEvent } from './audit';
import { DEMO_MODE, demoRegistrations } from './demo';

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

export const findDuplicateRegistration = async (
  activityId: string,
  lastName: string,
  firstName: string,
  phone: string,
  excludeId?: string
): Promise<Registration | null> => {
  if (DEMO_MODE) {
    const digits = phone.replace(/\D/g, '');
    return (
      demoRegistrations.find(
        (r) =>
          r.activityId === activityId &&
          r.lastName.trim().toLowerCase() === lastName.trim().toLowerCase() &&
          r.firstName.trim().toLowerCase() === firstName.trim().toLowerCase() &&
          r.phone.replace(/\D/g, '').includes(digits) &&
          r.id !== excludeId
      ) ?? null
    );
  }
  const db = await getDb();
  const phoneDigits = phone.replace(/\D/g, '');
  const sql = excludeId
    ? `SELECT ${COLUMNS} FROM registrations
         WHERE activity_id = $1
           AND LOWER(TRIM(last_name)) = LOWER(TRIM($2))
           AND LOWER(TRIM(first_name)) = LOWER(TRIM($3))
           AND REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE $4
           AND id != $5
         LIMIT 1`
    : `SELECT ${COLUMNS} FROM registrations
         WHERE activity_id = $1
           AND LOWER(TRIM(last_name)) = LOWER(TRIM($2))
           AND LOWER(TRIM(first_name)) = LOWER(TRIM($3))
           AND REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', '') LIKE $4
         LIMIT 1`;
  const params = excludeId
    ? [activityId, lastName, firstName, `%${phoneDigits}%`, excludeId]
    : [activityId, lastName, firstName, `%${phoneDigits}%`];
  const rows = await db.select<Row[]>(sql, params);
  return rows.length > 0 ? rowToRegistration(rows[0]) : null;
};

export const addRegistration = async (
  registration: Omit<Registration, 'id' | 'createdAt'>
): Promise<Registration> => {
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

const REGISTRATION_BATCH_SIZE = 200;

export const addRegistrationsBulk = async (
  registrations: Omit<Registration, 'id' | 'createdAt'>[]
): Promise<Registration[]> => {
  if (registrations.length === 0) return [];
  if (DEMO_MODE) {
    const inserted = registrations.map((reg) => ({
      ...reg,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    }));
    demoRegistrations.push(...inserted);
    for (const reg of inserted) {
      await logEvent('created', 'registration', reg.id, formatRegistrationSummary(reg));
    }
    return inserted;
  }
  const db = await getDb();
  const now = Date.now();
  const inserted: Registration[] = [];

  for (let start = 0; start < registrations.length; start += REGISTRATION_BATCH_SIZE) {
    const batch = registrations.slice(start, start + REGISTRATION_BATCH_SIZE);
    const placeholders: string[] = [];
    const params: unknown[] = [];
    const newRegs: Registration[] = [];
    let p = 1;
    for (const reg of batch) {
      const newReg: Registration = {
        ...reg,
        id: crypto.randomUUID(),
        createdAt: now,
      };
      newRegs.push(newReg);
      placeholders.push(
        `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`
      );
      params.push(
        newReg.id,
        newReg.firstName,
        newReg.lastName,
        newReg.phone,
        newReg.address,
        newReg.registrationDate,
        newReg.paymentType,
        newReg.amount,
        newReg.activityId,
        newReg.createdAt
      );
    }
    try {
      await db.execute(
        `INSERT INTO registrations (${COLUMNS}) VALUES ${placeholders.join(', ')}`,
        params
      );
      inserted.push(...newRegs);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Lot ${start + 1}-${start + batch.length} — ${msg}`
      );
    }
  }

  for (const reg of inserted) {
    await logEvent('created', 'registration', reg.id, formatRegistrationSummary(reg));
  }
  return inserted;
};
