import React from 'react';
import { FlaskConical } from 'lucide-react';
import { DEMO_MODE } from '../utils/demo';

/**
 * Badge du mode démonstration (3.4, U29) : en haut à droite de la zone principale, dans le flux
 * (il ne recouvre plus le pied de la sidebar ni le contenu). Blanc sur amber-800 : 7,1:1.
 */
const DemoBanner: React.FC = () => {
  if (!DEMO_MODE) return null;

  return (
    <p className="inline-flex items-center gap-1.5 shrink-0 rounded-full bg-amber-800 px-3 py-1 text-xs font-semibold text-white">
      <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
      Mode démonstration · données fictives
    </p>
  );
};

export default DemoBanner;
