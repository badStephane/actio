// @vitest-environment jsdom
/**
 * Validation QA du chantier UX (P7, 07-qa-ux.md). Rejoue au clavier les parcours du Lot 1 et
 * attaque les verrous de l'audit touchés par le formulaire qui ne redirige plus.
 * jsdom ne gère pas la touche Tab : l'ordre de tabulation est calculé comme le navigateur
 * (ordre du document, éléments focalisables, un seul arrêt par groupe radio : le bouton coché).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import type { Activity, Registration } from '../types';

const ACTIVITIES: Activity[] = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Général', color: '#64748b', createdAt: 1 },
  { id: 'act-plage', name: 'Sortie Plage', color: '#16a34a', eventDate: '2099-08-03', defaultAmount: 2500, createdAt: 2 },
];

const mocks = vi.hoisted(() => ({
  addRegistration: vi.fn(),
  findDuplicateRegistration: vi.fn(),
  searchContacts: vi.fn(),
}));

vi.mock('../utils/storage', () => ({
  addRegistration: mocks.addRegistration,
  findDuplicateRegistration: mocks.findDuplicateRegistration,
  getRegistrationById: vi.fn(async () => null),
  updateRegistration: vi.fn(),
}));
vi.mock('../utils/activities', () => ({ getActivities: async () => ACTIVITIES }));
vi.mock('../utils/contacts', () => ({ searchContacts: mocks.searchContacts }));

import RegistrationForm from './RegistrationForm';
import GlobalShortcuts from './GlobalShortcuts';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]';

/** Ordre de tabulation séquentiel du document (aucun tabindex positif dans l'app : vérifié par grep). */
const tabOrder = (root: ParentNode = document): HTMLElement[] =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if (el.getAttribute('tabindex') === '-1') return false;
    if (el.closest('[inert]')) return false;
    if (el instanceof HTMLInputElement && el.type === 'radio') {
      const group = Array.from(document.querySelectorAll<HTMLInputElement>(`input[type="radio"][name="${el.name}"]`));
      const checked = group.find((r) => r.checked);
      return checked ? el === checked : el === group[0];
    }
    return true;
  });

const stopName = (el: HTMLElement): string =>
  el instanceof HTMLInputElement && el.type === 'radio' ? `radio:${el.name}` : el.id || el.textContent?.trim() || el.tagName;

/** Un geste « Tab » : focus sur l'élément suivant dans l'ordre séquentiel. */
const pressTab = (): void => {
  const order = tabOrder();
  const index = order.indexOf(document.activeElement as HTMLElement);
  act(() => order[index + 1].focus());
};

const field = (id: string) => document.getElementById(id) as HTMLInputElement;
const type = (id: string, value: string) => fireEvent.change(field(id), { target: { value } });

const renderSaisie = async (path = '/add?activity=act-plage') => {
  render(
    <MemoryRouter initialEntries={[path]}>
      <GlobalShortcuts />
      <Routes>
        <Route path="/" element={<p>Accueil</p>} />
        <Route path="/add" element={<RegistrationForm />} />
        <Route path="/edit/:id" element={<RegistrationForm />} />
      </Routes>
    </MemoryRouter>
  );
  await screen.findByRole('option', { name: /Sortie Plage/ });
};

let idSeq = 0;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  idSeq = 0;
  mocks.findDuplicateRegistration.mockResolvedValue(null);
  mocks.searchContacts.mockResolvedValue([]);
  mocks.addRegistration.mockImplementation(async (p: Omit<Registration, 'id' | 'createdAt'>) => ({
    ...p, id: `r${++idSeq}`, createdAt: Date.now(),
  }));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('QA UX : ordre de tabulation et comptage des gestes (critère 1.4)', () => {
  it('Nom → Prénoms → Téléphone → Adresse → Paiement (un seul arrêt) → Montant', async () => {
    await renderSaisie();
    const form = field('lastName').closest('form') as HTMLFormElement;
    const order = tabOrder(form).map(stopName);
    const fromName = order.slice(order.indexOf('lastName'));
    expect(fromName.slice(0, 6)).toEqual(['lastName', 'firstName', 'phone', 'address', 'radio:paymentType', 'amount']);
    // Constat : après Montant viennent « Changer la date », « Effacer la saisie », « Voir la liste »
    // avant « Enregistrer » (4 Tab). Sans effet sur le comptage : Entrée valide depuis Montant ou Paiement.
    expect(fromName.slice(6)).toEqual(['Changer la date', 'Effacer la saisie', 'Voir la liste', 'EnregistrerEntrée']);
  });

  it('3 contacts nouveaux enchaînés sans souris : 6 gestes chacun (4 Tab, une touche 1/2/3, Entrée), cible ≤ 7', async () => {
    await renderSaisie();
    const people = [
      ['Diop', 'Awa', '77 123 45 67', '2', 'wave'],
      ['Fall', 'Modou', '78 123 45 67', '3', 'orange_money'],
      ['Ndiaye', 'Fatou', '76 123 45 67', '1', 'cash'],
    ] as const;

    for (const [i, [last, first, phone, key, expected]] of people.entries()) {
      let gestures = 0;
      expect(document.activeElement?.id).toBe('lastName'); // aucun clic : focus déjà sur Nom
      type('lastName', last);
      pressTab(); gestures++;
      type('firstName', first);
      pressTab(); gestures++;
      type('phone', phone);
      pressTab(); gestures++; // Adresse (facultative, D19) : laissée vide
      pressTab(); gestures++; // Paiement
      expect(document.activeElement?.id).toBe('paymentType-cash');
      fireEvent.keyDown(document.activeElement as HTMLElement, { key }); gestures++;
      fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Enter' }); gestures++;

      await waitFor(() => expect(mocks.addRegistration).toHaveBeenCalledTimes(i + 1));
      expect(mocks.addRegistration.mock.calls[i][0]).toMatchObject({ lastName: last, paymentType: expected, amount: 2500, address: '' });
      expect(gestures).toBeLessThanOrEqual(7);
      // Critère 1.2 : focus sur Nom en moins de 300 ms après Entrée.
      await waitFor(() => expect(document.activeElement?.id).toBe('lastName'), { timeout: 300 });
    }
    expect(screen.getByRole('complementary').textContent).toMatch(/3 inscriptions · 7\s500\sF/);
  });

  it('contact connu : 2 lettres, Entrée sur la suggestion, Entrée = 2 gestes hors frappe (cible ≤ 4)', async () => {
    mocks.searchContacts.mockImplementation(async (q: string) =>
      /^so/i.test(q) ? [{ id: 'c1', lastName: 'Sow', firstName: 'Ibrahima', phone: '77 999 88 77', address: 'Yoff', createdAt: 1 }] : []
    );
    await renderSaisie();
    type('lastName', 'So');
    await screen.findByRole('option', { name: /Sow Ibrahima/ });
    fireEvent.keyDown(field('lastName'), { key: 'Enter' });
    await waitFor(() => expect(document.activeElement?.id).toBe('paymentType-cash'));
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Enter' });
    await waitFor(() => expect(mocks.addRegistration).toHaveBeenCalledTimes(1));
    expect(mocks.addRegistration.mock.calls[0][0]).toMatchObject({ lastName: 'Sow', phone: '77 999 88 77', address: 'Yoff' });
  });
});

describe('QA UX : anti double soumission (QA-06) avec le formulaire qui ne redirige plus', () => {
  const fillValid = () => {
    type('lastName', 'Diop');
    type('firstName', 'Awa');
    type('phone', '77 123 45 67');
  };

  it('Entrée deux fois dans le groupe Paiement pendant un enregistrement lent : une seule inscription', async () => {
    let release: (v: Registration) => void = () => undefined;
    mocks.addRegistration.mockImplementation(
      (p: Omit<Registration, 'id' | 'createdAt'>) =>
        new Promise<Registration>((resolve) => { release = () => resolve({ ...p, id: 'r1', createdAt: Date.now() }); })
    );
    await renderSaisie();
    fillValid();
    const cash = field('paymentType-cash');
    fireEvent.keyDown(cash, { key: 'Enter' });
    fireEvent.keyDown(cash, { key: 'Enter' });
    await waitFor(() => expect(mocks.addRegistration).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /Enregistrement/ }));
    fireEvent.keyDown(cash, { key: 'Enter' });
    await act(async () => release({} as Registration));
    await screen.findByText(/Inscription enregistrée/);
    expect(mocks.addRegistration).toHaveBeenCalledTimes(1);
    // Le verrou est relâché : l'inscription suivante passe.
    fillValid();
    fireEvent.keyDown(field('paymentType-cash'), { key: 'Enter' });
    await waitFor(() => expect(mocks.addRegistration).toHaveBeenCalledTimes(2));
  });

  // Fiche QA-UX-01 : préexistant (même code en 60516d5), non couvert par le test de l'audit.
  it('doublon : double clic sur « Créer quand même » ne crée qu’une inscription', async () => {
    mocks.findDuplicateRegistration.mockResolvedValue({
      id: 'old', lastName: 'Diop', firstName: 'Awa', phone: '77 123 45 67', address: '', registrationDate: '2026-11-02',
      paymentType: 'wave', amount: 2500, activityId: 'act-plage', createdAt: 1,
    });
    await renderSaisie();
    fillValid();
    fireEvent.keyDown(field('paymentType-cash'), { key: 'Enter' });
    const confirm = await screen.findByRole('button', { name: 'Créer quand même' });
    fireEvent.click(confirm);
    fireEvent.click(confirm); // second clic dans les 150 ms de l'animation de fermeture : le bouton est encore là
    await screen.findByText(/Inscription enregistrée/);
    await new Promise((r) => setTimeout(r, 50));
    expect(mocks.addRegistration).toHaveBeenCalledTimes(1);
  });

  it('échec d’enregistrement : saisie conservée, alerte, verrou relâché (QA-07 tient)', async () => {
    mocks.addRegistration.mockRejectedValueOnce(new Error('database is locked'));
    await renderSaisie();
    fillValid();
    fireEvent.keyDown(field('paymentType-cash'), { key: 'Enter' });
    expect((await screen.findByRole('alert')).textContent).toMatch(/Vos informations sont conservées.*database is locked/);
    expect(field('lastName').value).toBe('Diop');
    expect(screen.queryByText(/Inscription enregistrée/)).toBeNull();
    expect(sessionStorage.getItem('actio.saisie.session')).toBe('[]'); // l'échec n'alimente pas le panneau
    fireEvent.keyDown(field('paymentType-cash'), { key: 'Enter' });
    await waitFor(() => expect(mocks.addRegistration).toHaveBeenCalledTimes(2));
  });
});

describe('QA UX : autocomplétion après choix d’un contact (1.5)', () => {
  // Fiche QA-UX-02 : préexistant, plus visible depuis le Lot 1 (le focus quitte le champ Nom).
  it('les listes des autres champs (Prénoms, Téléphone) restent fermées après le choix', async () => {
    const sow = { id: 'c1', lastName: 'Sow', firstName: 'Ibrahima', phone: '77 999 88 77', address: 'Yoff', createdAt: 1 };
    // Comme la vraie recherche : préfixe du nom OU du prénom.
    mocks.searchContacts.mockImplementation(async (q: string) => (/^(so|ib)/i.test(q) ? [sow] : []));
    await renderSaisie();
    type('lastName', 'So');
    await screen.findByRole('option', { name: /Sow Ibrahima/ });
    fireEvent.keyDown(field('lastName'), { key: 'Enter' });
    await waitFor(() => expect(document.activeElement?.id).toBe('paymentType-cash'));
    await new Promise((r) => setTimeout(r, 400)); // > anti-rebond de 180 ms
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(field('firstName').getAttribute('aria-expanded')).toBe('false');
  });
});

describe('QA UX : raccourcis globaux (D22) et verrou (D4, M5 Front)', () => {
  it('Ctrl+N : défaut navigateur toujours annulé ; ignoré si l’app est inerte (verrouillée) ou une modale ouverte', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <GlobalShortcuts />
        <Routes>
          <Route path="/" element={<p>Accueil</p>} />
          <Route path="/add" element={<p>Saisie</p>} />
        </Routes>
      </MemoryRouter>
    );
    const locked = document.createElement('div');
    locked.setAttribute('inert', '');
    document.body.appendChild(locked);
    const blocked = new KeyboardEvent('keydown', { key: 'n', ctrlKey: true, bubbles: true, cancelable: true });
    act(() => { window.dispatchEvent(blocked); });
    expect(blocked.defaultPrevented).toBe(true); // WebView2 n'ouvre pas de fenêtre
    expect(screen.getByText('Accueil')).toBeTruthy();
    locked.remove();

    const modal = document.createElement('div');
    modal.setAttribute('aria-modal', 'true');
    document.body.appendChild(modal);
    act(() => { fireEvent.keyDown(window, { key: 'F2' }); });
    expect(screen.getByText('Accueil')).toBeTruthy();
    modal.remove();

    act(() => { fireEvent.keyDown(window, { key: 'F2' }); });
    expect(await screen.findByText('Saisie')).toBeTruthy();
  });

  it('Ctrl+N en modification : rien ne se passe, la correction en cours est gardée', async () => {
    await renderSaisie();
    render(
      <MemoryRouter initialEntries={['/edit/r1']}>
        <GlobalShortcuts />
        <Routes>
          <Route path="/edit/:id" element={<p>Modification</p>} />
          <Route path="/add" element={<p>Saisie vide</p>} />
        </Routes>
      </MemoryRouter>
    );
    act(() => { fireEvent.keyDown(window, { key: 'n', ctrlKey: true }); });
    expect(screen.getByText('Modification')).toBeTruthy();
    expect(screen.queryByText('Saisie vide')).toBeNull();
  });

  it('touches 1/2/3 avec Ctrl ou Alt : ignorées (pas de conflit avec les raccourcis système)', async () => {
    await renderSaisie();
    fireEvent.keyDown(field('paymentType-cash'), { key: '2', ctrlKey: true });
    fireEvent.keyDown(field('paymentType-cash'), { key: '3', altKey: true });
    expect(field('paymentType-cash').checked).toBe(true);
  });
});
