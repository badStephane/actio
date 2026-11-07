import { describe, expect, it } from 'vitest';
import { PHONE_KEY_DIGITS, nameKey, personKey, phoneKey } from './phone';

describe('phoneKey (D9, QA-14, QA-22)', () => {
  it.each([
    '+221 77 123 45 67',
    '00221771234567',
    '771234567',
    '77.123.45.67',
    '(77) 123-45-67',
    '221771234567',
  ])('« %s » donne la clé 771234567', (phone) => {
    expect(phoneKey(phone)).toBe('771234567');
  });

  it('garde les chiffres significatifs quand Excel a mangé le 0 initial', () => {
    expect(phoneKey('0712345678')).toBe(phoneKey('712345678'));
  });

  it('compare les 9 derniers chiffres seulement', () => {
    expect(PHONE_KEY_DIGITS).toBe(9);
    expect(phoneKey('12')).toBe('12');
    expect(phoneKey('')).toBe('');
  });
});

describe('nameKey / personKey', () => {
  it('ignore casse, accents, espaces, tirets et apostrophes (y compris typographique)', () => {
    expect(nameKey('BÂ')).toBe(nameKey('Bâ'));
    expect(nameKey('Aïssatou')).toBe('aissatou');
    expect(nameKey("N'Diaye")).toBe(nameKey('N’Diaye'));
    expect(nameKey('Mame-Diarra')).toBe(nameKey('mame diarra'));
  });

  it('deux saisies de la même personne ont la même clé', () => {
    expect(personKey('Ndiaye', 'Aïssatou', '+221 77 123 45 67')).toBe(personKey('NDIAYE', 'aissatou', '771234567'));
  });

  it('un homonyme au numéro différent n’est pas un doublon', () => {
    expect(personKey('Diop', 'Awa', '771234567')).not.toBe(personKey('Diop', 'Awa', '781234567'));
  });
});
