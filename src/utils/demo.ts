import { Registration, Activity, DEFAULT_ACTIVITY_ID } from '../types';
import { todayLocalIso } from './dates';
import type { AuditEvent } from './audit';
import type { Contact } from './contacts';

/**
 * Mode démonstration.
 *
 * Quand `VITE_DEMO_MODE=true`, l'application n'accède plus à SQLite (Tauri) :
 * toute la couche de données est servie depuis les tableaux en mémoire
 * ci-dessous, seedés avec des données 100 % fictives. Aucune donnée réelle
 * n'est exposée et aucune persistance n'a lieu hors de la session navigateur.
 *
 * Ce mode permet d'héberger une démo cliquable en ligne (Vercel) à partir
 * du même code que l'application desktop locale.
 */
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

const DAY = 86_400_000;
const base = Date.now();

// --- Activités fictives ---------------------------------------------------
export const demoActivities: Activity[] = [
  {
    id: DEFAULT_ACTIVITY_ID,
    name: 'Général',
    color: '#64748b',
    createdAt: base - 90 * DAY,
  },
  {
    id: 'demo-act-gala',
    name: 'Tournoi de Gala',
    color: '#2563eb',
    eventDate: '2026-07-12',
    defaultAmount: 5000,
    createdAt: base - 40 * DAY,
  },
  {
    id: 'demo-act-couture',
    name: 'Atelier Couture',
    color: '#db2777',
    eventDate: '2026-06-28',
    defaultAmount: 3000,
    createdAt: base - 30 * DAY,
  },
  {
    id: 'demo-act-plage',
    name: 'Sortie Plage',
    color: '#16a34a',
    eventDate: '2026-08-03',
    defaultAmount: 2500,
    createdAt: base - 20 * DAY,
  },
  {
    id: 'demo-act-2025',
    name: 'Édition 2025',
    color: '#9333ea',
    eventDate: '2025-12-15',
    defaultAmount: 4000,
    archivedAt: base - 10 * DAY,
    createdAt: base - 200 * DAY,
  },
];

const reg = (
  i: number,
  firstName: string,
  lastName: string,
  phone: string,
  address: string,
  activityId: string,
  amount: number,
  paymentType: Registration['paymentType'],
  daysAgo: number
): Registration => ({
  id: `demo-reg-${i}`,
  firstName,
  lastName,
  phone,
  address,
  registrationDate: todayLocalIso(new Date(base - daysAgo * DAY)),
  paymentType,
  amount,
  activityId,
  createdAt: base - daysAgo * DAY,
});

// --- Inscriptions fictives -------------------------------------------------
export const demoRegistrations: Registration[] = [
  reg(1, 'Awa', 'Diop', '77 000 00 01', 'Médina, Dakar', 'demo-act-gala', 5000, 'wave', 1),
  reg(2, 'Moussa', 'Ndiaye', '77 000 00 02', 'Parcelles Assainies, Dakar', 'demo-act-gala', 5000, 'cash', 1),
  reg(3, 'Fatou', 'Sarr', '77 000 00 03', 'Yoff, Dakar', 'demo-act-couture', 3000, 'wave', 2),
  reg(4, 'Cheikh', 'Fall', '77 000 00 04', 'Ouakam, Dakar', 'demo-act-gala', 5000, 'orange_money', 3),
  reg(5, 'Aïssatou', 'Bâ', '77 000 00 05', 'Liberté 6, Dakar', 'demo-act-couture', 3000, 'cash', 3),
  reg(6, 'Ibrahima', 'Sow', '77 000 00 06', 'Grand Yoff, Dakar', 'demo-act-plage', 2500, 'wave', 4),
  reg(7, 'Mariama', 'Gueye', '77 000 00 07', 'Pikine, Dakar', 'demo-act-plage', 2500, 'wave', 5),
  reg(8, 'Ousmane', 'Diallo', '77 000 00 08', 'Guédiawaye', 'demo-act-gala', 5000, 'cash', 6),
  reg(9, 'Ndèye', 'Faye', '77 000 00 09', 'Sacré-Cœur, Dakar', 'demo-act-couture', 3500, 'orange_money', 7),
  reg(10, 'Modou', 'Cissé', '77 000 00 10', 'Almadies, Dakar', 'demo-act-plage', 2500, 'cash', 8),
  reg(11, 'Khady', 'Mbaye', '77 000 00 11', 'Point E, Dakar', 'demo-act-gala', 5000, 'wave', 9),
  reg(12, 'Babacar', 'Thiam', '77 000 00 12', 'Mermoz, Dakar', 'demo-act-couture', 3000, 'wave', 11),
];

// --- Annuaire de contacts fictif (numéros dans une plage manifestement fictive) --------
export const demoContacts: Contact[] = [
  { id: 'demo-contact-1', lastName: 'Diop', firstName: 'Awa', phone: '77 000 00 01', address: 'Médina, Dakar', source: 'Liste démo', createdAt: base - 60 * DAY },
  { id: 'demo-contact-2', lastName: 'Ndiaye', firstName: 'Moussa', phone: '77 000 00 02', address: 'Parcelles Assainies, Dakar', source: 'Liste démo', createdAt: base - 60 * DAY },
  { id: 'demo-contact-3', lastName: 'Sarr', firstName: 'Fatou', phone: '77 000 00 03', address: 'Yoff, Dakar', source: 'Liste démo', createdAt: base - 60 * DAY },
  { id: 'demo-contact-4', lastName: 'Kane', firstName: 'Abdou', phone: '77 000 00 13', address: 'Rufisque', createdAt: base - 30 * DAY },
];

// --- Journal d'audit -------------------------------------------------------
export const demoAudit: AuditEvent[] = [
  {
    id: 'demo-audit-1',
    eventType: 'created',
    entityType: 'activity',
    entityId: 'demo-act-gala',
    summary: 'Tournoi de Gala',
    createdAt: base - 40 * DAY,
  },
  {
    id: 'demo-audit-2',
    eventType: 'created',
    entityType: 'registration',
    entityId: 'demo-reg-1',
    summary: 'Diop Awa · 5 000 F',
    createdAt: base - 1 * DAY,
  },
];
