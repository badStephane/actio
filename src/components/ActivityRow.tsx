import React from 'react';
import { Archive, ArchiveRestore, BarChart3, CalendarDays, Download, FileUp, Lock, Pencil, Trash2, Users } from 'lucide-react';
import { Activity, DEFAULT_ACTIVITY_ID } from '../types';
import { formatAmount, formatDateShort } from './uiFormat';

interface ActivityRowProps {
  activity: Activity;
  count: number;
  countsLoaded: boolean;
  onStats: (a: Activity) => void;
  onExport: (a: Activity) => void;
  onImport: (a: Activity) => void;
  onEdit: (a: Activity) => void;
  onArchive: (a: Activity) => void;
  onDelete: (a: Activity) => void;
}

interface IconActionProps {
  label: string;
  tooltip: string;
  className: string;
  onClick: () => void;
  children: React.ReactNode;
}

/** Bouton icône de 36 px : nom accessible complet, infobulle courte (U16). */
const IconAction: React.FC<IconActionProps> = ({ label, tooltip, className, onClick, children }) => (
  <button type="button" onClick={onClick} aria-label={label} title={tooltip} className={`btn-icon ${className}`}>
    {children}
  </button>
);

/**
 * Ligne d'activité (Lot 2, 2.3). « Statistiques » et « Exporter » en boutons texte ; les actions
 * de gestion en icônes de 36 px. Archivée : badge et texte secondaire, plus d'opacité (U17).
 */
const ActivityRow: React.FC<ActivityRowProps> = ({
  activity: a, count, countsLoaded, onStats, onExport, onImport, onEdit, onArchive, onDelete,
}) => {
  const isDefault = a.id === DEFAULT_ACTIVITY_ID;
  const isArchived = Boolean(a.archivedAt);
  // Une activité absente du GROUP BY n'a aucune inscription.
  const canDelete = !isDefault && countsLoaded && count === 0;

  return (
    <div className="panel px-3 py-2.5 flex flex-wrap items-center gap-3">
      <span className="h-3 w-3 rounded-full flex-shrink-0 border border-gray-500" style={{ backgroundColor: a.color }} aria-hidden="true" />
      <div className="flex-1 min-w-[12rem]">
        <div className="flex items-center gap-2">
          <h3 className={`text-sm font-semibold truncate ${isArchived ? 'text-ink-muted' : 'text-ink'}`}>{a.name}</h3>
          {isDefault && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-muted">
              <Lock className="h-3 w-3" aria-hidden="true" /> par défaut
            </span>
          )}
          {isArchived && (
            <span className="px-2 py-0.5 rounded-full bg-gray-200 text-xs font-semibold text-ink-soft">Archivée</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 text-sm text-ink-muted mt-0.5">
          {a.eventDate && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              {formatDateShort(a.eventDate)}
            </span>
          )}
          {a.defaultAmount !== undefined && a.defaultAmount > 0 && (
            <span className="tabular-nums">Montant habituel : {formatAmount(a.defaultAmount)}</span>
          )}
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            {count} inscription{count > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 flex-shrink-0">
        {count > 0 && (
          <>
            <button type="button" onClick={() => onStats(a)} className="btn btn-default btn-sm" aria-label={`Statistiques de ${a.name}`}>
              <BarChart3 className="h-4 w-4" aria-hidden="true" />
              Statistiques
            </button>
            <button type="button" onClick={() => onExport(a)} className="btn btn-default btn-sm" aria-label={`Exporter les inscriptions de ${a.name} en Excel`}>
              <Download className="h-4 w-4" aria-hidden="true" />
              Exporter
            </button>
          </>
        )}
        {!isArchived && (
          <IconAction label={`Importer une liste d'inscriptions dans ${a.name}`} tooltip="Importer une liste" className="text-brand-700 hover:bg-brand-50" onClick={() => onImport(a)}>
            <FileUp className="h-4 w-4" aria-hidden="true" />
          </IconAction>
        )}
        <IconAction label={`Modifier ${a.name}`} tooltip="Modifier" className="text-ink-soft hover:bg-gray-100" onClick={() => onEdit(a)}>
          <Pencil className="h-4 w-4" aria-hidden="true" />
        </IconAction>
        {!isDefault && (
          <IconAction
            label={`${isArchived ? 'Réactiver' : 'Archiver'} ${a.name}`}
            tooltip={isArchived ? 'Réactiver' : 'Archiver'}
            className="text-ink-soft hover:bg-gray-100"
            onClick={() => onArchive(a)}
          >
            {isArchived ? <ArchiveRestore className="h-4 w-4" aria-hidden="true" /> : <Archive className="h-4 w-4" aria-hidden="true" />}
          </IconAction>
        )}
        {canDelete && (
          <IconAction label={`Supprimer ${a.name}`} tooltip="Supprimer" className="text-danger hover:bg-danger-soft" onClick={() => onDelete(a)}>
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </IconAction>
        )}
      </div>
    </div>
  );
};

export default ActivityRow;

/** Chargement des activités (U28) : 4 lignes en skeleton plutôt qu'un spinner. */
export const ActivityListSkeleton: React.FC = () => (
  <div className="page space-y-2" aria-busy="true">
    <div className="flex justify-end mb-4"><div className="skeleton h-8 w-40 rounded" /></div>
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="panel px-3 py-3 flex items-center gap-3">
        <div className="skeleton h-3 w-3 rounded-full" />
        <div className="flex-1 space-y-1.5">
          <div className="skeleton h-3.5 w-48 rounded" />
          <div className="skeleton h-3 w-32 rounded" />
        </div>
        <div className="skeleton h-8 w-28 rounded" />
      </div>
    ))}
    <span className="sr-only">Chargement des activités...</span>
  </div>
);
