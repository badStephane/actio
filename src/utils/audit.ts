import { getDb } from './db';
import { DEMO_MODE, demoAudit } from './demo';

export type EventType =
  | 'created'
  | 'updated'
  | 'deleted'
  | 'archived'
  | 'unarchived'
  | 'imported'
  | 'restored'
  | 'backup_exported'
  | 'reset'
  | 'password_changed'
  | 'recovery_used'
  | 'audit_cleared';
export type EntityType = 'registration' | 'activity' | 'system';

/** Événements d'administration (entité `system`). `backup_exported`, `restored` et `reset`
 *  sont écrits par les commandes Rust ; les autres par la couche TS. */
export type SystemEventType = Extract<
  EventType,
  'imported' | 'restored' | 'backup_exported' | 'reset' | 'password_changed' | 'recovery_used' | 'audit_cleared'
>;

export const SYSTEM_ENTITY_ID = 'system';

export interface AuditEvent {
  id: string;
  eventType: EventType;
  entityType: EntityType;
  entityId: string;
  summary: string;
  details?: string;
  createdAt: number;
}

interface Row {
  id: string;
  event_type: EventType;
  entity_type: EntityType;
  entity_id: string;
  summary: string;
  details: string | null;
  created_at: number;
}

const rowToEvent = (r: Row): AuditEvent => ({
  id: r.id,
  eventType: r.event_type,
  entityType: r.entity_type,
  entityId: r.entity_id,
  summary: r.summary,
  details: r.details ?? undefined,
  createdAt: r.created_at,
});

const INSERT_SQL =
  'INSERT INTO audit_events (id, event_type, entity_type, entity_id, summary, details, created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)';

const writeEvent = async (
  eventType: EventType,
  entityType: EntityType,
  entityId: string,
  summary: string,
  details?: object
): Promise<void> => {
  const event: AuditEvent = {
    id: crypto.randomUUID(),
    eventType,
    entityType,
    entityId,
    summary,
    details: details ? JSON.stringify(details) : undefined,
    createdAt: Date.now(),
  };
  if (DEMO_MODE) {
    demoAudit.unshift(event);
    return;
  }
  const db = await getDb();
  await db.execute(INSERT_SQL, [
    event.id,
    event.eventType,
    event.entityType,
    event.entityId,
    event.summary,
    event.details ?? null,
    event.createdAt,
  ]);
};

/**
 * Journal des opérations courantes (CRUD), au mieux : un échec d'écriture du journal
 * ne bloque pas l'opération de l'utilisateur (elle a déjà eu lieu).
 */
export const logEvent = async (
  eventType: EventType,
  entityType: EntityType,
  entityId: string,
  summary: string,
  details?: object
): Promise<void> => {
  try {
    await writeEvent(eventType, entityType, entityId, summary, details);
  } catch (error) {
    console.warn('Failed to log audit event:', error);
  }
};

/** Journal des opérations d'administration : l'erreur est propagée à l'appelant. */
export const logSystemEvent = async (
  eventType: SystemEventType,
  summary: string,
  details?: object
): Promise<void> => writeEvent(eventType, 'system', SYSTEM_ENTITY_ID, summary, details);

export const getAuditEvents = async (limit = 500): Promise<AuditEvent[]> => {
  if (DEMO_MODE) {
    return [...demoAudit].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
  }
  const db = await getDb();
  const rows = await db.select<Row[]>(
    'SELECT id, event_type, entity_type, entity_id, summary, details, created_at FROM audit_events ORDER BY created_at DESC LIMIT $1',
    [limit]
  );
  return rows.map(rowToEvent);
};

/**
 * Efface l'historique en laissant une trace `audit_cleared` (D8).
 * L'événement est écrit AVANT la purge : si l'écriture échoue, rien n'est effacé.
 */
export const clearAuditLog = async (): Promise<void> => {
  if (DEMO_MODE) {
    const count = demoAudit.length;
    demoAudit.length = 0;
    await logSystemEvent('audit_cleared', `Historique effacé (${count} événements)`, { count });
    return;
  }
  const db = await getDb();
  const rows = await db.select<{ n: number }[]>('SELECT COUNT(*) AS n FROM audit_events');
  const count = rows[0]?.n ?? 0;
  const markerId = crypto.randomUUID();
  await db.execute(INSERT_SQL, [
    markerId,
    'audit_cleared',
    'system',
    SYSTEM_ENTITY_ID,
    `Historique effacé (${count} événements)`,
    JSON.stringify({ count }),
    Date.now(),
  ]);
  await db.execute('DELETE FROM audit_events WHERE id != $1', [markerId]);
};
