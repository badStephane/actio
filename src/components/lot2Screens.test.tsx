// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { Activity, Registration } from '../types';
import { todayLocalIso } from '../utils/dates';

const TODAY = todayLocalIso();
const ACTIVITIES: Activity[] = [
  { id: 'act-plage', name: 'Sortie Plage', color: '#16a34a', eventDate: '2020-08-03', defaultAmount: 2500, createdAt: 2 },
];
const rows = (n: number, overrides: Partial<Registration> = {}): Registration[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `r${i}`, firstName: 'Awa', lastName: `Nom${String(i).padStart(2, '0')}`, phone: `77 000 00 ${String(i).padStart(2, '0')}`,
    address: '', registrationDate: '2020-07-01', paymentType: i % 2 === 0 ? 'wave' : 'cash', amount: 2500,
    activityId: 'act-plage', createdAt: i, ...overrides,
  }));

const data = vi.hoisted(() => ({ registrations: [] as Registration[] }));
vi.mock('../utils/storage', () => ({
  getRegistrations: async () => data.registrations,
  deleteRegistration: vi.fn(),
}));
vi.mock('../utils/activities', () => ({ getActivities: async () => ACTIVITIES }));
vi.mock('../utils/importReview', () => ({ findSuspiciousRegistrations: async () => [] }));
vi.mock('../utils/excelExport', () => ({ exportToExcel: vi.fn() }));

import Home from '../pages/Home';
import RegistrationList from './RegistrationList';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/registrations" element={<RegistrationList />} />
      </Routes>
    </MemoryRouter>
  );

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(cleanup);

describe('Accueil (2.1)', () => {
  it('activité passée : « Terminée le … », jamais une durée passée', async () => {
    data.registrations = rows(3);
    renderAt('/');
    expect(await screen.findByText('Terminée le 3 août 2020')).toBeTruthy();
    expect(screen.queryByText(/Il y a/)).toBeNull();
    expect(screen.queryByText(/Temps restant/)).toBeNull();
    // Lot 3, a) : plus de « Activité en cours » à côté de « Terminée le … ».
    expect(screen.getByText('Activité suivie')).toBeTruthy();
    expect(screen.queryByText('Activité en cours')).toBeNull();
    expect(screen.getByText('Moyenne par inscription : 2 500 F', { normalizer: s => s })).toBeTruthy();
  });

  it('0 inscription aujourd’hui : « Aucune inscription aujourd’hui » et lien Nouvelle inscription ; bascule vers toute l’activité', async () => {
    data.registrations = rows(3);
    renderAt('/');
    const card = (await screen.findByRole('heading', { name: 'Modes de paiement' })).closest('section') as HTMLElement;
    expect(within(card).getByText('Aucune inscription aujourd’hui.')).toBeTruthy();
    expect(within(card).getByRole('link', { name: 'Nouvelle inscription' }).getAttribute('href')).toBe('/add?activity=act-plage');
    expect(within(card).getByRole('button', { name: "Aujourd'hui" }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(within(card).getByRole('button', { name: "Toute l'activité" }));
    expect(within(card).getByText(/^3$/)).toBeTruthy();
    expect(screen.getByText('Aucune aujourd’hui')).toBeTruthy();
  });

  it('inscriptions du jour : la carte compte la caisse du jour par défaut', async () => {
    data.registrations = [...rows(2), ...rows(1, { id: 'today', registrationDate: TODAY, paymentType: 'orange_money' })];
    renderAt('/');
    const card = (await screen.findByRole('heading', { name: 'Modes de paiement' })).closest('section') as HTMLElement;
    expect(card.textContent).toMatch(/1 inscription · 2\s500\sF/);
  });
});

describe('Liste (2.2)', () => {
  it('premier passage : écran de choix ; ensuite la même liste, le même filtre et la même page', async () => {
    data.registrations = rows(60);
    const first = renderAt('/registrations');
    fireEvent.click(await screen.findByRole('button', { name: /Sortie Plage/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Filtrer par mode de paiement' }), { target: { value: 'wave' } });
    fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
    expect(screen.getByText(/26-30 sur 30/)).toBeTruthy();
    first.unmount();

    // Retour après une modification : /registrations sans paramètre.
    renderAt('/registrations');
    expect(await screen.findByText(/26-30 sur 30/)).toBeTruthy();
    expect((screen.getByRole('combobox', { name: 'Filtrer par mode de paiement' }) as HTMLSelectElement).value).toBe('wave');
    expect(screen.queryByText('Sélectionnez une liste à consulter')).toBeNull();
  });

  it('aucune action de remplacement de la base dans la Liste (D20)', async () => {
    data.registrations = rows(2);
    renderAt('/registrations?activity=act-plage');
    await screen.findByRole('button', { name: /Exporter Excel/ });
    expect(screen.queryByRole('button', { name: /Restaurer/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Sauvegarder/ })).toBeNull();
    expect(screen.getByLabelText('Rechercher par nom, prénom ou téléphone')).toBeTruthy();
  });
});
