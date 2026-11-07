// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import type { Activity, Registration } from '../types';

const DEFAULT_ACT = '00000000-0000-0000-0000-000000000001';

const mocks = vi.hoisted(() => ({
  addRegistration: vi.fn(),
  findDuplicateRegistration: vi.fn(),
}));

vi.mock('../utils/storage', () => ({
  addRegistration: mocks.addRegistration,
  findDuplicateRegistration: mocks.findDuplicateRegistration,
  getRegistrationById: vi.fn(),
  updateRegistration: vi.fn(),
}));
vi.mock('../utils/activities', () => ({
  getActivities: async (): Promise<Activity[]> => [{ id: DEFAULT_ACT, name: 'Inscriptions générales', color: '#000', createdAt: 1 }],
}));
vi.mock('../utils/contacts', () => ({ searchContacts: async () => [] }));

import RegistrationForm from './RegistrationForm';

const fill = (id: string, value: string) => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`champ ${id} absent`);
  fireEvent.change(el, { target: { value } });
};

const renderFilledForm = async () => {
  render(
    <MemoryRouter initialEntries={['/add']}>
      <RegistrationForm />
    </MemoryRouter>
  );
  await screen.findByRole('option', { name: 'Inscriptions générales' });
  fill('lastName', 'Diop');
  fill('firstName', 'Awa');
  fill('phone', '77 123 45 67');
  fill('address', 'Médina');
  fill('amount', '5000');
  return screen.getByRole('button', { name: 'Enregistrer' }).closest('form') as HTMLFormElement;
};

afterEach(() => {
  cleanup();
  mocks.addRegistration.mockReset();
  mocks.findDuplicateRegistration.mockReset();
});

describe('RegistrationForm', () => {
  it('double soumission rapide : une seule inscription créée (M2, QA-06)', async () => {
    let releaseDuplicateCheck: (value: Registration | null) => void = () => {};
    mocks.findDuplicateRegistration.mockReturnValue(new Promise((resolve) => { releaseDuplicateCheck = resolve; }));
    mocks.addRegistration.mockResolvedValue({});
    const form = await renderFilledForm();

    fireEvent.submit(form);
    fireEvent.submit(form); // second clic / seconde touche Entrée pendant la vérification de doublon
    await act(async () => releaseDuplicateCheck(null));

    await waitFor(() => expect(mocks.addRegistration).toHaveBeenCalledTimes(1));
    expect(mocks.findDuplicateRegistration).toHaveBeenCalledTimes(1);
    expect(mocks.addRegistration.mock.calls[0][0]).toMatchObject({ lastName: 'Diop', amount: 5000 });
  });

  it('échec d’enregistrement : message visible, saisie conservée, bouton réactivé (M1, QA-07)', async () => {
    mocks.findDuplicateRegistration.mockResolvedValue(null);
    mocks.addRegistration.mockRejectedValue(new Error('database is locked'));
    const form = await renderFilledForm();

    fireEvent.submit(form);

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/n'a pas pu être enregistrée.*database is locked/);
    expect((document.getElementById('lastName') as HTMLInputElement).value).toBe('Diop');
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toHaveProperty('disabled', false);
  });

  it('montant décimal refusé dans le formulaire, rien n’est envoyé (M10)', async () => {
    const form = await renderFilledForm();
    fill('amount', '1500.5'); // champ type=number : la virgule est déjà filtrée par le navigateur
    fireEvent.submit(form);
    expect(await screen.findByText('Montant entier en F CFA, sans décimales')).toBeTruthy();
    expect(mocks.findDuplicateRegistration).not.toHaveBeenCalled();
    expect(mocks.addRegistration).not.toHaveBeenCalled();
  });
});
