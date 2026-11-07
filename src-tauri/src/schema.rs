//! SQL des migrations 10 et suivantes. Une fois livrée, une migration ne change plus jamais
//! (sqlx vérifie la somme SHA-384 du texte). Toute évolution passe par une nouvelle version.
//!
//! sqlx exécute chaque migration dans une transaction, avec `PRAGMA foreign_keys = ON`
//! (posé à l'ouverture de chaque connexion par sqlx-sqlite) : une migration réussit en entier
//! ou n'est pas appliquée du tout.

/// Journal d'audit : types d'événements système, entité `system`, interdiction de l'UPDATE.
/// Les lignes existantes sont copiées à l'identique.
pub const MIGRATION_10_AUDIT: &str = "CREATE TABLE audit_events_v10 (
  id TEXT PRIMARY KEY NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('created','updated','deleted','archived','unarchived','imported','restored','backup_exported','reset','password_changed','recovery_used','audit_cleared')),
  entity_type TEXT NOT NULL CHECK(entity_type IN ('registration','activity','system')),
  entity_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  details TEXT,
  created_at INTEGER NOT NULL
);
INSERT INTO audit_events_v10 (id, event_type, entity_type, entity_id, summary, details, created_at)
  SELECT id, event_type, entity_type, entity_id, summary, details, created_at FROM audit_events;
DROP TABLE audit_events;
ALTER TABLE audit_events_v10 RENAME TO audit_events;
CREATE INDEX IF NOT EXISTS audit_events_created_at_idx ON audit_events (created_at DESC);
CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'AUDIT_IMMUTABLE');
END;";

/// Inscriptions : montant entier >= 0, clé étrangère vers activities (ON DELETE RESTRICT), index.
/// Aucune ligne n'est supprimée et aucune valeur ne disparaît :
/// - montant non entier (avenant A1 : trace probable d'un « 1,500 » mal lu à l'import) : la valeur
///   d'origine est d'abord copiée dans `amount_review` (reason = 'non_integer'), puis convertie en
///   `ROUND(amount * 1000)` si elle est < 1000, sinon en `ROUND(amount)` ;
/// - montant négatif ou non numérique : ramené à 0 ;
/// - inscription orpheline (activité supprimée) : rattachée à l'activité par défaut.
///
/// Chaque valeur modifiée laisse en plus un événement `updated` dans audit_events
/// (`details` = migration, champ, ancienne et nouvelle valeur).
pub const MIGRATION_11_REGISTRATIONS: &str = "CREATE TABLE IF NOT EXISTS amount_review (
  registration_id TEXT PRIMARY KEY NOT NULL,
  original_amount REAL NOT NULL,
  reason TEXT NOT NULL,
  reviewed_at INTEGER
);
INSERT INTO amount_review (registration_id, original_amount, reason, reviewed_at)
  SELECT id, amount, 'non_integer', NULL FROM registrations
  WHERE typeof(amount) IN ('integer', 'real') AND amount != CAST(amount AS INTEGER);
INSERT OR IGNORE INTO activities (id, name, color, created_at)
  VALUES ('00000000-0000-0000-0000-000000000001', 'Inscriptions générales', '#3b82f6', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
INSERT INTO audit_events (id, event_type, entity_type, entity_id, summary, details, created_at)
  SELECT lower(hex(randomblob(16))), 'updated', 'registration', r.id,
         r.last_name || ' ' || r.first_name || ' · rattachée à l''activité par défaut (activité introuvable)',
         json_object('migration', 11, 'field', 'activity_id', 'oldValue', r.activity_id, 'newValue', '00000000-0000-0000-0000-000000000001'),
         CAST(strftime('%s', 'now') AS INTEGER) * 1000
  FROM registrations r
  WHERE r.activity_id IS NULL OR r.activity_id NOT IN (SELECT id FROM activities);
UPDATE registrations SET activity_id = '00000000-0000-0000-0000-000000000001'
  WHERE activity_id IS NULL OR activity_id NOT IN (SELECT id FROM activities);
INSERT INTO audit_events (id, event_type, entity_type, entity_id, summary, details, created_at)
  SELECT lower(hex(randomblob(16))), 'updated', 'registration', r.id,
         r.last_name || ' ' || r.first_name || ' · montant corrigé lors de la mise à jour : ' || quote(r.amount) || ' devient ' || (CASE WHEN typeof(r.amount) NOT IN ('integer', 'real') OR r.amount < 0 THEN 0 WHEN r.amount != CAST(r.amount AS INTEGER) AND r.amount < 1000 THEN CAST(ROUND(r.amount * 1000) AS INTEGER) ELSE CAST(ROUND(r.amount) AS INTEGER) END),
         json_object('migration', 11, 'field', 'amount', 'oldValue', r.amount, 'newValue', CASE WHEN typeof(r.amount) NOT IN ('integer', 'real') OR r.amount < 0 THEN 0 WHEN r.amount != CAST(r.amount AS INTEGER) AND r.amount < 1000 THEN CAST(ROUND(r.amount * 1000) AS INTEGER) ELSE CAST(ROUND(r.amount) AS INTEGER) END),
         CAST(strftime('%s', 'now') AS INTEGER) * 1000
  FROM registrations r
  WHERE NOT (typeof(r.amount) IN ('integer', 'real') AND r.amount >= 0 AND r.amount = CAST(r.amount AS INTEGER));
CREATE TABLE registrations_v11 (
  id TEXT PRIMARY KEY NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL,
  registration_date TEXT NOT NULL,
  payment_type TEXT NOT NULL CHECK(payment_type IN ('wave','cash','orange_money')),
  amount INTEGER NOT NULL CHECK(typeof(amount) = 'integer' AND amount >= 0),
  activity_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES activities(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL
);
INSERT INTO registrations_v11 (id, first_name, last_name, phone, address, registration_date, payment_type, amount, activity_id, created_at)
  SELECT r.id, r.first_name, r.last_name, r.phone, r.address, r.registration_date, r.payment_type,
         CASE WHEN typeof(r.amount) NOT IN ('integer', 'real') OR r.amount < 0 THEN 0 WHEN r.amount != CAST(r.amount AS INTEGER) AND r.amount < 1000 THEN CAST(ROUND(r.amount * 1000) AS INTEGER) ELSE CAST(ROUND(r.amount) AS INTEGER) END,
         r.activity_id, r.created_at
  FROM registrations r;
DROP TABLE registrations;
ALTER TABLE registrations_v11 RENAME TO registrations;
CREATE INDEX IF NOT EXISTS registrations_activity_id_idx ON registrations (activity_id);
CREATE INDEX IF NOT EXISTS registrations_created_at_idx ON registrations (created_at DESC);";

/// Compteur d'échecs de déverrouillage persistant (mot de passe et code de récupération)
/// et date de fin de blocage (ms epoch), pour le backoff exponentiel.
pub const MIGRATION_12_AUTH_BACKOFF: &str = "ALTER TABLE auth_settings ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE auth_settings ADD COLUMN locked_until INTEGER;";
