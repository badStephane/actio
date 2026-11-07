import React from 'react';
import { PAYMENT_META, PaymentType } from './paymentMeta';
import PaymentLogo from './PaymentLogo';

interface PaymentBadgeProps {
  type: PaymentType;
  /** Texte ajouté après le libellé, ex. « 3 · 7 500 F ». */
  suffix?: string;
}

/** Badge de mode de paiement : logo + libellé, encre foncée sur fond doux (>= 6:1, inchangé). */
const PaymentBadge: React.FC<PaymentBadgeProps> = ({ type, suffix }) => {
  const meta = PAYMENT_META[type];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${meta.badgeClass}`}>
      <PaymentLogo type={type} sizeClass="h-3.5 w-3.5" />
      {meta.label}
      {suffix && <span className="tabular-nums">{suffix}</span>}
    </span>
  );
};

export default PaymentBadge;
