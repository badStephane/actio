import React from 'react';
import { Check } from 'lucide-react';
import { PAYMENT_METAS, PaymentType, paymentRadioId, paymentTypeForKey } from './paymentMeta';

interface PaymentSegmentProps {
  value: PaymentType;
  onChange: (type: PaymentType) => void;
}

/**
 * Mode de paiement en 3 boutons de 44 px (Lot 1, 1.4, U6). Vrais boutons radio (un seul arrêt
 * de tabulation, flèches natives) ; touches 1, 2, 3 quand le groupe a le focus ; Entrée enregistre.
 */
const PaymentSegment: React.FC<PaymentSegmentProps> = ({ value, onChange }) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLFieldSetElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
      return;
    }
    const type = paymentTypeForKey(e.key);
    if (!type) return;
    e.preventDefault();
    onChange(type);
    document.getElementById(paymentRadioId(type))?.focus();
  };

  return (
    <fieldset onKeyDown={handleKeyDown}>
      <legend className="block text-sm font-semibold text-ink-soft mb-1">
        Mode de paiement<span className="text-danger" aria-hidden="true"> *</span>
      </legend>
      <p id="paymentType-hint" className="sr-only">Touches 1, 2 ou 3 pour choisir le mode.</p>
      <div className="flex flex-wrap gap-2">
        {PAYMENT_METAS.map(meta => {
          const isChecked = value === meta.type;
          const Icon = isChecked ? Check : meta.icon;
          return (
            <label key={meta.type} className="relative cursor-pointer">
              <input
                type="radio"
                id={paymentRadioId(meta.type)}
                name="paymentType"
                value={meta.type}
                checked={isChecked}
                onChange={() => onChange(meta.type)}
                aria-describedby="paymentType-hint"
                className="peer sr-only"
              />
              <span
                className={`flex items-center gap-2 h-control-lg min-w-[8rem] px-3 rounded-control border text-sm font-semibold select-none transition-colors duration-fast peer-focus-visible:ring-2 peer-focus-visible:ring-brand-600 peer-focus-visible:ring-offset-2 ${
                  isChecked ? meta.selectedClass : 'bg-white border-gray-500 text-ink hover:bg-gray-50'
                }`}
              >
                <Icon className={`h-4 w-4 shrink-0 ${isChecked ? '' : meta.textClass}`} aria-hidden="true" />
                {meta.label}
                <span className={`ml-auto pl-2 text-xs font-normal ${isChecked ? 'text-white' : 'text-ink-muted'}`} aria-hidden="true">
                  {meta.shortcut}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
};

export default PaymentSegment;
