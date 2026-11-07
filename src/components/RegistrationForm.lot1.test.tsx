// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Activity, Registration } from '../types';

const DEFAULT_ACT = '00000000-0000-0000-0000-000000000001';
const ACTIVITIES: Activity[] = [
  { id: DEFAULT_ACT, name: 'Général', color: '#64748b', createdAt: 1 },
  { id: 'act-plage', name: 'Sortie Plage', color: '#16a34a', eventDate: '2099-08-03', defaultAmount: 2500, createdAt: 2 },
  { id: 'act-gala', name: 'Tournoi de Gala', color: '#2563eb', eventDate: '2020-07-12', defaultAmount: 5000, createdAt: 3 },
];

const mocks = vi.hoisted(() => ({
  addRegistration: vi.fn(),
  updateRegistration: vi.fn(),
  getRegistrationById: vi.fn(),
  findDuplicateRegistration: vi.fn(),
  searchContacts: vi.fn(),
}));

vi.mock('../utils/storage', () => ({
  addRegistration: mocks.addRegistration,
  updateRegistration: mocks.updateRegistration,
  getRegistrationById: mocks.getRegistrationById,
  findDuplicateRegistration: mocks.findDuplicateRegistration,
}));
vi.mock('../utils/activities', () => ({ getActivities: async () => ACTIVITIES }));
vi.mock('../utils/contacts', () => ({ searchContacts: mocks.searchContacts }));

import RegistrationForm from './RegistrationForm';
import GlobalShortcuts from './GlobalShortcuts';
import { CURRENT_ACTIVITY_KEY } from './currentActivity';

const el = <T extends HTMLElement = HTMLInputElement>(id: string): T => {
  const found = document.getElementById(id);
  if (!found) throw new Error(`élément ${id} absent`);
  return found as T;
};
const fill = (id: string, value: string) => fireEvent.change(el(id), { target: { value } });
const radio = (type: string) => el(`paymentType-${type}`);

const renderApp = async (path = '/add') => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <GlobalShortcuts />
      <Routes>
        <Route path="/" element={<p>Accueil</p>} />
        <Route path="/add" element={<RegistrationForm />} />
        <Route path="/edit/:id" element={<RegistrationForm />} />
        <Route path="/registrations" element={<p>Liste</p>} />
      </Routes>
    </MemoryRouter>
  );
  if (path.startsWith('/add')) await screen.findByRole('option', { name: /Sortie Plage/ });
};

const saved = (payload: Omit<Registration, 'id' | 'createdAt'>): Registration => ({
  ...payload, id: 'r1', createdAt: new Date(2026, 10, 7, 10, 42).getTime(),
});

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mocks.findDuplicateRegistration.mockResolvedValue(null);
  mocks.getRegistrationById.mockResolvedValue(null);
  mocks.searchContacts.mockResolvedValue([]);
  mocks.addRegistration.mockImplementation(async (p) => saved(p));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Lot 1 : activité du guichet (1.1)', () => {
  it('reprend l’activité mémorisée par l’accueil, son montant habituel et signale un événement passé', async () => {
    localStorage.setItem(CURRENT_ACTIVITY_KEY, 'act-gala');
    await renderApp();
    expect(el<HTMLSelectElement>('activityId').value).toBe('act-gala');
    expect(el('amount').value).toBe('5 000');
    expect(screen.getByText('Événement passé')).toBeTruthy();
  });

  it('?activity= est prioritaire et devient l’activité du guichet ; changer d’activité suit', async () => {
    localStorage.setItem(CURRENT_ACTIVITY_KEY, 'act-gala');
    await renderApp('/add?activity=act-plage');
    expect(el('amount').value).toBe('2 500');
    expect(localStorage.getItem(CURRENT_ACTIVITY_KEY)).toBe('act-plage');
    fireEvent.change(el('activityId'), { target: { value: 'act-gala' } });
    expect(el('amount').value).toBe('5 000');
    expect(localStorage.getItem(CURRENT_ACTIVITY_KEY)).toBe('act-gala');
  });
});

describe('Lot 1 : enregistrer et enchaîner (1.2, 1.3)', () => {
  it('après succès : pas de redirection, formulaire vidé, focus sur Nom, Espèces et montant remis, bandeau et panneau', async () => {
    await renderApp('/add?activity=act-plage');
    expect(document.activeElement?.id).toBe('lastName'); // autoFocus à l'arrivée (U3)
    fill('lastName', 'Diop');
    fill('firstName', 'Awa');
    fill('phone', '77 123 45 67');
    fireEvent.keyDown(radio('cash'), { key: '2' });
    expect((radio('wave') as HTMLInputElement).checked).toBe(true);

    fireEvent.keyDown(radio('wave'), { key: 'Enter' });

    const banner = await screen.findByText(/Inscription enregistrée/);
    expect(banner.closest('[role="status"]')).toBeTruthy();
    expect(banner.textContent).toMatch(/DIOP Awa · 2\s500\sF · Wave/);
    expect(mocks.addRegistration).toHaveBeenCalledWith(expect.objectContaining({ paymentType: 'wave', amount: 2500, address: '' }));
    expect(screen.queryByText('Liste')).toBeNull();
    expect(el('lastName').value).toBe('');
    expect(el('phone').value).toBe('');
    expect((radio('cash') as HTMLInputElement).checked).toBe(true);
    expect(el('amount').value).toBe('2 500');
    await waitFor(() => expect(document.activeElement?.id).toBe('lastName'));
    // Bandeau et panneau proposent tous deux « Modifier », vers la saisie au retour.
    const editLinks = screen.getAllByRole('link', { name: /Modifier l'inscription de DIOP Awa/ });
    expect(editLinks.map(a => a.getAttribute('href'))).toEqual(['/edit/r1?retour=saisie', '/edit/r1?retour=saisie']);

    const panel = screen.getByRole('complementary', { name: 'Saisies de cette session · Sortie Plage' });
    expect(panel.textContent).toMatch(/1 inscription/);
    expect(panel.textContent).toMatch(/Wave1 · 2\s500\sF/);
    expect(JSON.parse(sessionStorage.getItem('actio.saisie.session') ?? '[]')).toHaveLength(1);
  });

  it('le panneau suit l’activité du guichet ; les saisies de l’autre activité réapparaissent au retour', async () => {
    await renderApp('/add?activity=act-plage');
    fill('lastName', 'Diop');
    fill('firstName', 'Awa');
    fill('phone', '77 123 45 67');
    fireEvent.submit(el('lastName').closest('form') as HTMLFormElement);
    await screen.findByText(/Inscription enregistrée/);

    fireEvent.change(el('activityId'), { target: { value: 'act-gala' } });
    const galaPanel = screen.getByRole('complementary', { name: 'Saisies de cette session · Tournoi de Gala' });
    expect(galaPanel.textContent).toMatch(/Aucune saisie pour cette activité/);
    expect(galaPanel.textContent).not.toMatch(/DIOP Awa/);

    fireEvent.change(el('activityId'), { target: { value: 'act-plage' } });
    const plagePanel = screen.getByRole('complementary', { name: 'Saisies de cette session · Sortie Plage' });
    expect(plagePanel.textContent).toMatch(/DIOP Awa/);
    expect(plagePanel.textContent).toMatch(/1 inscription · 2\s500\sF/);
  });

  it('touches 1/2/3 dans le groupe Paiement, Entrée enregistre une seule fois', async () => {
    await renderApp('/add?activity=act-plage');
    fill('lastName', 'Fall');
    fill('firstName', 'Modou');
    fill('phone', '78 123 45 67');
    radio('cash').focus();
    fireEvent.keyDown(radio('cash'), { key: '3' });
    expect((radio('orange_money') as HTMLInputElement).checked).toBe(true);
    expect(document.activeElement?.id).toBe('paymentType-orange_money');
    fireEvent.keyDown(radio('orange_money'), { key: '1' });
    expect((radio('cash') as HTMLInputElement).checked).toBe(true);
    fireEvent.keyDown(radio('cash'), { key: 'Enter' });
    await waitFor(() => expect(mocks.addRegistration).toHaveBeenCalledTimes(1));
    expect(mocks.addRegistration.mock.calls[0][0]).toMatchObject({ paymentType: 'cash', lastName: 'Fall' });
  });

  it('envoi invalide : rien n’est envoyé et le focus va au premier champ en erreur', async () => {
    await renderApp('/add?activity=act-plage');
    fill('lastName', 'Diop');
    fireEvent.submit(el('lastName').closest('form') as HTMLFormElement);
    expect(await screen.findByText('Le prénom est requis')).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.id).toBe('firstName'));
    expect(screen.queryByText(/adresse est requise/i)).toBeNull();
    expect(mocks.addRegistration).not.toHaveBeenCalled();
  });

  it('« Changer la date » révèle le champ date et lui donne le focus', async () => {
    await renderApp('/add?activity=act-plage');
    expect(document.getElementById('registrationDate')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Changer la date' }));
    await waitFor(() => expect(document.activeElement?.id).toBe('registrationDate'));
    fill('registrationDate', '2026-01-05');
    expect(screen.getByText(/05\/01\/2026, différente d'aujourd'hui/)).toBeTruthy();
  });

  it('contact du carnet : coordonnées reprises (adresse comprise), focus sauté sur Paiement', async () => {
    mocks.searchContacts.mockResolvedValue([
      { id: 'c1', lastName: 'Sow', firstName: 'Ibrahima', phone: '77 999 88 77', address: 'Yoff', source: 'x', createdAt: 1 },
    ]);
    await renderApp('/add?activity=act-plage');
    fill('lastName', 'So');
    await screen.findByRole('option', { name: /Sow Ibrahima/ });
    expect(el('lastName').getAttribute('aria-activedescendant')).toBe('lastName-suggestions-opt-0');
    fireEvent.keyDown(el('lastName'), { key: 'Enter' });
    expect(el('firstName').value).toBe('Ibrahima');
    expect(el('address').value).toBe('Yoff');
    expect(screen.getByText('Coordonnées reprises du carnet : 77 999 88 77')).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.id).toBe('paymentType-cash'));
  });
});

describe('Lot 1 : raccourcis et modification (1.2, 1.4)', () => {
  it('Ctrl+N ouvre la saisie ; F2 sur la saisie remet le focus sur Nom sans rien effacer', async () => {
    await renderApp('/');
    act(() => {
      fireEvent.keyDown(window, { key: 'n', ctrlKey: true });
    });
    await screen.findByRole('option', { name: /Sortie Plage/ });
    fill('lastName', 'Diop');
    el('firstName').focus();
    fireEvent.keyDown(window, { key: 'F2' });
    expect(document.activeElement?.id).toBe('lastName');
    expect(el('lastName').value).toBe('Diop');
  });

  it('modification depuis le panneau : « Mettre à jour » revient à la saisie avec un toast', async () => {
    mocks.getRegistrationById.mockResolvedValue(saved({
      lastName: 'Diop', firstName: 'Awa', phone: '77 123 45 67', address: '',
      registrationDate: '2026-11-07', paymentType: 'wave', amount: 2500, activityId: 'act-plage',
    }));
    mocks.updateRegistration.mockResolvedValue(undefined);
    await renderApp('/edit/r1?retour=saisie');
    await waitFor(() => expect(el('lastName').value).toBe('Diop'));
    fill('amount', '3000');
    fireEvent.click(screen.getByRole('button', { name: 'Mettre à jour' }));
    expect(await screen.findByText('Inscription modifiée.')).toBeTruthy();
    expect(mocks.updateRegistration).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1', amount: 3000 }));
    await screen.findByRole('complementary', { name: /^Saisies de cette session/ });
  });
});
