import React from 'react';
import { PAYMENT_META, PaymentType } from './paymentMeta';

interface PaymentLogoProps {
  type: PaymentType;
  /** Hauteur et largeur du logo (classes Tailwind), 16 px par défaut. */
  sizeClass?: string;
  /** Pastille blanche derrière le logo : lisible sur un fond de couleur (bouton choisi). */
  onTile?: boolean;
}

/**
 * Logo d'un mode de paiement (D25). Toujours décoratif (`alt=""`) : le libellé texte est affiché
 * à côté, partout ; un lecteur d'écran n'entend donc jamais le mode deux fois.
 */
const PaymentLogo: React.FC<PaymentLogoProps> = ({ type, sizeClass = 'h-4 w-4', onTile = false }) => {
  const meta = PAYMENT_META[type];
  const img = <img src={meta.logo} alt="" className={`${sizeClass} shrink-0 object-contain ${meta.logoClass}`} draggable={false} />;
  if (!onTile) return img;
  return <span className="inline-flex items-center justify-center h-5 w-5 shrink-0 rounded-sm bg-white" aria-hidden="true">{img}</span>;
};

export default PaymentLogo;
