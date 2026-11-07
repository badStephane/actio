import { Registration } from '../types';
import especesLogo from '../assets/payment/especes.svg';
import waveLogo from '../assets/payment/wave.png';
import orangeMoneyLogo from '../assets/payment/orange-money.png';

/**
 * Source unique des modes de paiement (plan design §2, U6, U21, U24).
 * Ordre fixe partout : Espèces, Wave, Orange Money. Jamais la couleur seule :
 * chaque mode s'affiche avec son logo (D25, décoratif) ET son libellé texte, toujours.
 * Les classes sont écrites en entier pour que Tailwind les détecte.
 */
export type PaymentType = Registration['paymentType'];

export interface PaymentMeta {
  type: PaymentType;
  label: string;
  /** Logo du mode (URL d'asset Vite), affiché en `<img alt="">` à côté du libellé. */
  logo: string;
  /** Classe de forme du logo (Wave : coins arrondis pour adoucir son fond carré). */
  logoClass: string;
  /** Touche du clavier qui sélectionne ce mode dans la saisie. */
  shortcut: '1' | '2' | '3';
  /** Texte coloré sur fond blanc (>= 5:1). */
  textClass: string;
  /** Remplissage graphique (barres, points, secteurs ; >= 3:1 sur blanc). */
  fillClass: string;
  /** Badge : fond doux + encre foncée (>= 6:1). */
  badgeClass: string;
  /** Bouton sélectionné : fond plein, texte blanc (>= 5:1). */
  selectedClass: string;
  /** Couleur de remplissage pour les graphiques (recharts). */
  hex: string;
}

export const PAYMENT_ORDER: readonly PaymentType[] = ['cash', 'wave', 'orange_money'];

export const PAYMENT_META: Readonly<Record<PaymentType, PaymentMeta>> = {
  cash: {
    type: 'cash',
    label: 'Espèces',
    logo: especesLogo,
    logoClass: '',
    shortcut: '1',
    textClass: 'text-cash',
    fillClass: 'bg-cash-fill',
    badgeClass: 'bg-cash-soft text-cash-ink',
    selectedClass: 'bg-cash border-cash text-white',
    hex: '#059669',
  },
  wave: {
    type: 'wave',
    label: 'Wave',
    logo: waveLogo,
    logoClass: 'rounded-xs',
    shortcut: '2',
    textClass: 'text-wave',
    fillClass: 'bg-wave-fill',
    badgeClass: 'bg-wave-soft text-wave-ink',
    selectedClass: 'bg-wave border-wave text-white',
    hex: '#0284C7',
  },
  orange_money: {
    type: 'orange_money',
    label: 'Orange Money',
    logo: orangeMoneyLogo,
    logoClass: '',
    shortcut: '3',
    textClass: 'text-om',
    fillClass: 'bg-om-fill',
    badgeClass: 'bg-om-soft text-om-ink',
    selectedClass: 'bg-om border-om text-white',
    hex: '#EA580C',
  },
};

/** Métadonnées dans l'ordre d'affichage. */
export const PAYMENT_METAS: readonly PaymentMeta[] = PAYMENT_ORDER.map(type => PAYMENT_META[type]);

export const paymentLabel = (type: PaymentType): string => PAYMENT_META[type].label;

/** Mode associé à une touche 1, 2 ou 3 ; undefined pour toute autre touche. */
export const paymentTypeForKey = (key: string): PaymentType | undefined =>
  PAYMENT_METAS.find(m => m.shortcut === key)?.type;

/** Identifiant du bouton radio d'un mode dans la saisie (focus après choix d'un contact). */
export const paymentRadioId = (type: PaymentType): string => `paymentType-${type}`;

/** Le mode remis par défaut après chaque enregistrement (D21). */
export const DEFAULT_PAYMENT_TYPE: PaymentType = 'cash';
