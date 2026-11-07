import React from 'react';
import { FlaskConical } from 'lucide-react';
import { DEMO_MODE } from '../utils/demo';

/**
 * Bandeau visible uniquement en mode démonstration, pour signaler que les
 * données sont fictives et non persistées.
 */
const DemoBanner: React.FC = () => {
  if (!DEMO_MODE) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-full bg-amber-700 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
      <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
      Mode démonstration · données fictives
    </div>
  );
};

export default DemoBanner;
