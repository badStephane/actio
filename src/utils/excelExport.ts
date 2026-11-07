import * as XLSX from 'xlsx';
import { Registration, Activity } from '../types';
import { todayLocalIso } from './dates';

const PAYMENT_LABEL: Record<Registration['paymentType'], string> = {
  wave: 'Wave',
  cash: 'Espèce',
  orange_money: 'Orange Money',
};

/** Caractères qui font interpréter une cellule comme une formule (Excel, LibreOffice, CSV). */
const FORMULA_START = /^[=+\-@\t\r]/;

/** Numéro de téléphone ou nombre (« +221 77 000 00 01 ») : aucune formule possible, laissé intact. */
const NUMERIC_LIKE = /^[+-]?[\d\s.()]+$/;

/** Neutralise une valeur texte qui serait lue comme une formule si le fichier est réenregistré en CSV. */
export const safeCell = (value: string): string =>
  FORMULA_START.test(value) && !NUMERIC_LIKE.test(value) ? `'${value}` : value;

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Horodatage local lisible et triable : 'AAAA-MM-JJ HH:MM'. */
const localDateTime = (ms: number): string => {
  const d = new Date(ms);
  return `${todayLocalIso(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

export const exportToExcel = (
  registrations: Registration[],
  activities: Activity[],
  filename?: string
): void => {
  const activityNameById = new Map(activities.map((a) => [a.id, a.name]));

  // En-têtes relus tels quels par l'import (importRegistrations.ts) : l'aller-retour est sans perte.
  const data = registrations.map(reg => ({
    'Activité': safeCell(activityNameById.get(reg.activityId) ?? ''),
    'Nom': safeCell(reg.lastName),
    'Prénoms': safeCell(reg.firstName),
    'Téléphone': safeCell(reg.phone),
    'Adresse': safeCell(reg.address),
    "Date d'inscription": reg.registrationDate,
    'Montant (F CFA)': reg.amount,
    'Type de paiement': PAYMENT_LABEL[reg.paymentType],
    'Date de création': localDateTime(reg.createdAt),
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(data);

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Inscriptions');

  const finalName = filename ?? `inscriptions_${todayLocalIso()}`;
  XLSX.writeFile(workbook, `${finalName}.xlsx`);
};
