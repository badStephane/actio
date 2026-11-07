//! Commandes Rust de sauvegarde, restauration et réinitialisation.
//!
//! Les boîtes de dialogue s'ouvrent côté Rust : le webview ne choisit jamais un chemin
//! arbitraire et n'a besoin d'aucune permission `fs`.

use std::borrow::Cow;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use sqlx::migrate::{MigrateError, Migration as SqlxMigration, MigrationType, Migrator};
use sqlx::sqlite::SqliteConnection;
use sqlx::{Connection, Executor, Pool, Sqlite};
use tauri::{AppHandle, Runtime, State};
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_sql::{DbInstances, DbPool};

use crate::backup::{self, BackupInfo, BackupKind};
use crate::{DB_FILE_NAME, DB_URL};

const SQLITE_HEADER: &[u8; 16] = b"SQLite format 3\0";
const MIN_DB_BYTES: u64 = 512;
const MAX_DB_BYTES: u64 = 500 * 1024 * 1024;
const DEFAULT_ACTIVITY_ID: &str = "00000000-0000-0000-0000-000000000001";
const REQUIRED_TABLES: [&str; 3] = ["registrations", "activities", "_sqlx_migrations"];

static OPERATION_IN_PROGRESS: AtomicBool = AtomicBool::new(false);

/// Une seule opération lourde à la fois (sauvegarde, restauration, réinitialisation).
struct OperationGuard;

impl OperationGuard {
  fn acquire() -> Result<Self, String> {
    if OPERATION_IN_PROGRESS.swap(true, Ordering::SeqCst) {
      return Err("Une opération sur la base est déjà en cours.".into());
    }
    Ok(Self)
  }
}

impl Drop for OperationGuard {
  fn drop(&mut self) {
    OPERATION_IN_PROGRESS.store(false, Ordering::SeqCst);
  }
}

/// Migrateur sqlx identique à celui que construit tauri-plugin-sql (même SQL, donc mêmes
/// sommes de contrôle), pour mettre à niveau un fichier restauré AVANT de le mettre en place.
pub fn app_migrator(max_version: Option<i64>) -> Migrator {
  let mut list: Vec<SqlxMigration> = crate::migrations()
    .into_iter()
    .filter(|m| max_version.map_or(true, |max| m.version <= max))
    .map(|m| {
      SqlxMigration::new(
        m.version,
        Cow::Borrowed(m.description),
        MigrationType::ReversibleUp,
        Cow::Borrowed(m.sql),
        false,
      )
    })
    .collect();
  list.sort_by_key(|m| m.version);
  Migrator {
    migrations: Cow::Owned(list),
    ..Migrator::DEFAULT
  }
}

pub fn app_schema_version() -> i64 {
  crate::migrations().iter().map(|m| m.version).max().unwrap_or(0)
}

fn now_ms() -> i64 {
  SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_millis() as i64)
    .unwrap_or(0)
}

pub async fn insert_system_event<'e, E>(
  executor: E,
  event_type: &str,
  summary: &str,
  details: serde_json::Value,
) -> Result<(), String>
where
  E: Executor<'e, Database = Sqlite>,
{
  executor
    .execute(
      sqlx::query(
        "INSERT INTO audit_events (id, event_type, entity_type, entity_id, summary, details, created_at)
         VALUES (lower(hex(randomblob(16))), ?1, 'system', 'system', ?2, ?3, ?4)",
      )
      .bind(event_type)
      .bind(summary)
      .bind(details.to_string())
      .bind(now_ms()),
    )
    .await
    .map(|_| ())
    .map_err(|e| format!("Écriture dans l'historique impossible : {e}"))
}

async fn plugin_pool(instances: &DbInstances) -> Result<Pool<Sqlite>, String> {
  let map = instances.0.read().await;
  match map.get(DB_URL) {
    Some(DbPool::Sqlite(pool)) => Ok(pool.clone()),
    None => Err("La base n'est pas ouverte.".into()),
  }
}

fn file_name_of(path: &Path) -> String {
  path
    .file_name()
    .map(|n| n.to_string_lossy().into_owned())
    .unwrap_or_default()
}

async fn pick_save_path<R: Runtime>(app: &AppHandle<R>) -> Result<Option<PathBuf>, String> {
  let app = app.clone();
  let stamp = backup::utc_stamp(SystemTime::now());
  let default_name = format!("inscriptions_{}-{}-{}.db", &stamp[0..4], &stamp[4..6], &stamp[6..8]);
  let picked = tauri::async_runtime::spawn_blocking(move || {
    app
      .dialog()
      .file()
      .set_title("Exporter la base de données")
      .set_file_name(default_name)
      .add_filter("Base SQLite", &["db"])
      .blocking_save_file()
  })
  .await
  .map_err(|e| e.to_string())?;
  picked
    .map(|p| p.into_path().map_err(|e| e.to_string()))
    .transpose()
}

async fn pick_open_path<R: Runtime>(app: &AppHandle<R>) -> Result<Option<PathBuf>, String> {
  let app = app.clone();
  let picked = tauri::async_runtime::spawn_blocking(move || {
    app
      .dialog()
      .file()
      .set_title("Restaurer une sauvegarde")
      .add_filter("Base SQLite", &["db", "sqlite", "sqlite3"])
      .blocking_pick_file()
  })
  .await
  .map_err(|e| e.to_string())?;
  picked
    .map(|p| p.into_path().map_err(|e| e.to_string()))
    .transpose()
}

#[tauri::command]
pub async fn export_database<R: Runtime>(
  app: AppHandle<R>,
  instances: State<'_, DbInstances>,
) -> Result<Option<String>, String> {
  let _guard = OperationGuard::acquire()?;
  let Some(target) = pick_save_path(&app).await? else {
    return Ok(None);
  };
  let pool = plugin_pool(&instances).await?;
  backup::vacuum_into(&pool, &target).await?;
  let details = serde_json::json!({ "file": file_name_of(&target) });
  if let Err(e) = insert_system_event(&pool, "backup_exported", "Sauvegarde exportée", details).await {
    log::warn!("sauvegarde exportée mais non journalisée : {e}");
  }
  Ok(Some(target.to_string_lossy().into_owned()))
}

/// Contrôles sur le fichier choisi, avant toute copie.
fn check_candidate_file(source: &Path) -> Result<(), String> {
  let size = fs::metadata(source)
    .map_err(|e| format!("Fichier illisible : {e}"))?
    .len();
  if !(MIN_DB_BYTES..=MAX_DB_BYTES).contains(&size) {
    return Err("Ce fichier n'est pas une sauvegarde Actio valide (taille inattendue).".into());
  }
  let mut header = [0u8; 16];
  fs::File::open(source)
    .and_then(|mut f| f.read_exact(&mut header))
    .map_err(|e| format!("Fichier illisible : {e}"))?;
  if &header != SQLITE_HEADER {
    return Err("Ce fichier n'est pas une base SQLite.".into());
  }
  Ok(())
}

fn migrate_error_message(e: MigrateError) -> String {
  match e {
    MigrateError::VersionMissing(_) => {
      "Cette sauvegarde provient d'une version plus récente d'Actio. Mettez l'application à jour avant de la restaurer.".into()
    }
    MigrateError::VersionMismatch(v) => {
      format!("Cette sauvegarde a été produite par une version modifiée d'Actio (étape {v} différente) : restauration refusée.")
    }
    MigrateError::Dirty(v) => {
      format!("Cette sauvegarde contient une mise à jour inachevée (étape {v}) : restauration refusée.")
    }
    other => format!("La mise à niveau de la sauvegarde a échoué : {other}"),
  }
}

/// Vérifie le fichier copié en zone de transit, le met à niveau avec les migrations de l'app
/// et y journalise la restauration. La base en service n'est pas touchée.
async fn validate_and_upgrade(conn: &mut SqliteConnection, source_name: &str) -> Result<(), String> {
  let integrity: Vec<String> = sqlx::query_scalar("PRAGMA integrity_check")
    .fetch_all(&mut *conn)
    .await
    .map_err(|e| format!("Vérification d'intégrité impossible : {e}"))?;
  if integrity != ["ok"] {
    return Err("Cette sauvegarde est endommagée (contrôle d'intégrité en échec).".into());
  }

  let tables: i64 = sqlx::query_scalar(
    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN (?1, ?2, ?3)",
  )
  .bind(REQUIRED_TABLES[0])
  .bind(REQUIRED_TABLES[1])
  .bind(REQUIRED_TABLES[2])
  .fetch_one(&mut *conn)
  .await
  .map_err(|e| e.to_string())?;
  if tables != REQUIRED_TABLES.len() as i64 {
    return Err("Ce fichier n'est pas une sauvegarde Actio (tables attendues absentes).".into());
  }

  let (from_version, failed): (Option<i64>, i64) = sqlx::query_as(
    "SELECT MAX(version), COALESCE(SUM(success = 0), 0) FROM _sqlx_migrations",
  )
  .fetch_one(&mut *conn)
  .await
  .map_err(|e| e.to_string())?;
  let from_version = from_version.unwrap_or(0);
  if from_version > app_schema_version() {
    return Err(migrate_error_message(MigrateError::VersionMissing(from_version)));
  }
  if failed > 0 {
    return Err("Cette sauvegarde contient une mise à jour inachevée : restauration refusée.".into());
  }

  app_migrator(None)
    .run_direct(&mut *conn)
    .await
    .map_err(migrate_error_message)?;

  let fk_violations: Vec<(String,)> = sqlx::query_as("SELECT \"table\" FROM pragma_foreign_key_check")
    .fetch_all(&mut *conn)
    .await
    .map_err(|e| e.to_string())?;
  if !fk_violations.is_empty() {
    return Err("Cette sauvegarde contient des références incohérentes : restauration refusée.".into());
  }

  let details = serde_json::json!({ "file": source_name, "fromSchemaVersion": from_version });
  insert_system_event(&mut *conn, "restored", "Base restaurée depuis une sauvegarde", details).await
}

pub(crate) async fn prepare_staging(source: &Path, staging: &Path) -> Result<(), String> {
  check_candidate_file(source)?;
  let _ = fs::remove_file(staging);
  fs::copy(source, staging).map_err(|e| format!("Copie du fichier impossible : {e}"))?;
  let mut conn = backup::open_connection(staging, false).await?;
  let result = validate_and_upgrade(&mut conn, &file_name_of(source)).await;
  let _ = conn.close().await;
  result?;
  fs::File::open(staging)
    .and_then(|f| f.sync_all())
    .map_err(|e| format!("Écriture sur le disque impossible : {e}"))
}

/// Remplace la base (pool fermé) : fichiers annexes supprimés puis renommage atomique.
fn swap_in(staging: &Path, db: &Path) -> Result<(), String> {
  for suffix in ["-wal", "-shm", "-journal"] {
    let side = PathBuf::from(format!("{}{suffix}", db.to_string_lossy()));
    if side.exists() {
      fs::remove_file(&side).map_err(|e| format!("Suppression de {} impossible : {e}", file_name_of(&side)))?;
    }
  }
  fs::rename(staging, db).map_err(|e| format!("Remplacement de la base impossible : {e}"))
}

async fn show_error<R: Runtime>(app: &AppHandle<R>, message: String) {
  let app = app.clone();
  let _ = tauri::async_runtime::spawn_blocking(move || {
    app
      .dialog()
      .message(message)
      .title("Actio")
      .kind(MessageDialogKind::Error)
      .blocking_show()
  })
  .await;
}

#[tauri::command]
pub async fn restore_database<R: Runtime>(
  app: AppHandle<R>,
  instances: State<'_, DbInstances>,
) -> Result<bool, String> {
  let guard = OperationGuard::acquire()?;
  let Some(source) = pick_open_path(&app).await? else {
    return Ok(false);
  };
  let db = backup::db_path(&app)?;
  let staging = db.with_file_name(format!("{DB_FILE_NAME}.restore-tmp"));
  if let Err(e) = prepare_staging(&source, &staging).await {
    let _ = fs::remove_file(&staging);
    return Err(e);
  }

  let pool = plugin_pool(&instances).await?;
  let dir = backup::backup_dir(&app)?;
  let before = dir.join(backup::backup_file_name(&app, BackupKind::BeforeRestore));
  if let Err(e) = backup::vacuum_into(&pool, &before).await {
    let _ = fs::remove_file(&staging);
    return Err(format!("Sauvegarde de la base actuelle impossible, restauration annulée : {e}"));
  }
  if let Err(e) = backup::rotate(&dir, BackupKind::BeforeRestore) {
    log::warn!("rotation des sauvegardes avant restauration : {e}");
  }

  pool.close().await;
  if let Err(e) = swap_in(&staging, &db) {
    log::error!("restauration : {e}");
    let _ = fs::remove_file(&staging);
    show_error(
      &app,
      format!("La restauration a échoué : {e}\nVos données actuelles sont intactes. L'application va redémarrer."),
    )
    .await;
  }
  // Pas de nouvelle opération avant le redémarrage : le pool est fermé.
  std::mem::forget(guard);
  app.request_restart();
  Ok(true)
}

#[tauri::command]
pub async fn reset_app_data<R: Runtime>(
  app: AppHandle<R>,
  instances: State<'_, DbInstances>,
) -> Result<(), String> {
  let guard = OperationGuard::acquire()?;
  let pool = plugin_pool(&instances).await?;
  let dir = backup::backup_dir(&app)?;
  let backup_name = backup::backup_file_name(&app, BackupKind::BeforeReset);
  backup::vacuum_into(&pool, &dir.join(&backup_name))
    .await
    .map_err(|e| format!("Sauvegarde préalable impossible, rien n'a été effacé : {e}"))?;
  if let Err(e) = backup::rotate(&dir, BackupKind::BeforeReset) {
    log::warn!("rotation des sauvegardes avant réinitialisation : {e}");
  }
  purge_all(&pool, &backup_name).await?;
  std::mem::forget(guard);
  app.request_restart();
  Ok(())
}

/// Purge transactionnelle. L'ordre respecte la clé étrangère registrations -> activities.
pub async fn purge_all(pool: &Pool<Sqlite>, backup_name: &str) -> Result<(), String> {
  let fail = |e: sqlx::Error| format!("Effacement impossible, rien n'a été modifié : {e}");
  let mut tx = pool.begin().await.map_err(fail)?;
  for sql in [
    "DELETE FROM registrations",
    "DELETE FROM amount_review",
    "DELETE FROM contacts",
    "DELETE FROM audit_events",
    "DELETE FROM auth_settings",
  ] {
    tx.execute(sql).await.map_err(fail)?;
  }
  tx.execute(sqlx::query("DELETE FROM activities WHERE id <> ?1").bind(DEFAULT_ACTIVITY_ID))
    .await
    .map_err(fail)?;
  tx.execute(
    sqlx::query(
      "INSERT OR IGNORE INTO activities (id, name, color, created_at) VALUES (?1, 'Inscriptions générales', '#3b82f6', ?2)",
    )
    .bind(DEFAULT_ACTIVITY_ID)
    .bind(now_ms()),
  )
  .await
  .map_err(fail)?;
  let details = serde_json::json!({ "backup": backup_name });
  insert_system_event(&mut *tx, "reset", "Données de l'application effacées", details).await?;
  tx.commit().await.map_err(fail)
}

#[tauri::command]
pub async fn list_auto_backups<R: Runtime>(app: AppHandle<R>) -> Result<Vec<BackupInfo>, String> {
  backup::list_backups(&app)
}
