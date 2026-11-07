import React, { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { TriangleExclamationPoint } from 'lucide-react';
import { findSuspiciousRegistrations } from '../utils/importReview';

/**
 * Bandeau discret de l'accueil (Avenant A1) : n'apparaît que s'il reste des
 * inscriptions importées à vérifier. En cas d'erreur, il reste masqué
 * (l'écran « Contrôle des imports » affiche l'erreur lui-même).
 */
const ImportReviewBanner: React.FC = () => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    findSuspiciousRegistrations()
      .then(list => { if (!cancelled) setCount(list.length); })
      .catch(() => { if (!cancelled) setCount(0); });
    return () => { cancelled = true; };
  }, []);

  if (count === 0) return null;

  return (
    <div role="status" className="mb-4 panel border-amber-300 bg-amber-50 px-4 py-2.5 flex flex-wrap items-center gap-2 text-xs text-amber-900">
      <TriangleExclamationPoint className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span className="flex-1 min-w-0">
        {count} inscription{count > 1 ? 's' : ''} importée{count > 1 ? 's' : ''} à vérifier : montants ou dates
        possiblement mal lus lors d'un import Excel.
      </span>
      <Link to="/imports/review" className="btn btn-default">Vérifier</Link>
    </div>
  );
};

export default ImportReviewBanner;
