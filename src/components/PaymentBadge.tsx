import React from 'react';
import { PAYMENT_META, PaymentType } from './paymentMeta';

interface PaymentBadgeProps {
  type: PaymentType;
  /** Texte ajouté après le libellé, ex. « 3 · 7 500 F ». */
  suffix?: string;
}

/** Badge de mode de paiement : icône + libellé, encre foncée sur fond doux (>= 6:1). */
const PaymentBadge: React.FC<PaymentBadgeProps> = ({ type, suffix }) => {
  const meta = PAYMENT_META[type];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${meta.badgeClass}`}>
      <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
      {meta.label}
      {suffix && <span className="tabular-nums">{suffix}</span>}
    </span>
  );
};

export default PaymentBadge;
