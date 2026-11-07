// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('../utils/auth', () => ({
  createInitialPassword: vi.fn(),
  verifyPassword: vi.fn(),
  MIN_PASSWORD_LENGTH: 8,
}));

import PaymentBadge from './PaymentBadge';
import PaymentSegment from './PaymentSegment';
import LockScreen from './LockScreen';
import { PAYMENT_METAS } from './paymentMeta';

afterEach(cleanup);

describe('logos de paiement (D25)', () => {
  it('pastille : logo décoratif (alt vide) et libellé texte toujours affiché', () => {
    for (const meta of PAYMENT_METAS) {
      const { container, unmount } = render(<PaymentBadge type={meta.type} />);
      const img = container.querySelector('img');
      expect(img?.getAttribute('alt')).toBe('');
      expect(img?.getAttribute('src')).toBe(meta.logo);
      expect(container.textContent).toContain(meta.label);
      unmount();
    }
  });

  it('Wave : coins arrondis ; segment : nom accessible = libellé seul, coche sur le mode choisi', () => {
    const { container } = render(<PaymentSegment value="wave" onChange={() => undefined} />);
    const waveImg = [...container.querySelectorAll('img')].find(i => i.getAttribute('src') === PAYMENT_METAS[1].logo);
    expect(waveImg?.className).toContain('rounded-sm');
    expect(screen.getByRole('radio', { name: 'Wave' })).toHaveProperty('checked', true);
    expect(screen.getByRole('radio', { name: 'Espèces' })).toHaveProperty('checked', false);
    expect(container.querySelectorAll('img[alt=""]')).toHaveLength(3);
  });
});

describe('marque Actio (D24)', () => {
  it('écran de verrouillage et de création du mot de passe : logo couleur « Actio »', () => {
    const { unmount } = render(<LockScreen mode="unlock" onUnlocked={() => undefined} onForgot={() => undefined} />);
    expect(screen.getByRole('img', { name: 'Actio' }).getAttribute('src')).toMatch(/actio-logo\.svg/);
    unmount();
    render(<LockScreen mode="setup" onUnlocked={() => undefined} onForgot={() => undefined} />);
    expect(screen.getByRole('img', { name: 'Actio' })).toBeTruthy();
  });
});
