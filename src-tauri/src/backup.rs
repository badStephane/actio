//! Fichier de base, dossier de sauvegardes, instantanés et rotation.
//!
//! Chemin de la base : tauri-plugin-sql 2.4 ouvre `sqlite:inscriptions.db` dans
//! `app_config_dir()` (wrapper.rs, `DbPool::connect`). Sous Windows et macOS ce dossier est
//! le même que `app_data_dir()`, sous Linux il diffère : on suit donc le plugin.

use std::fs;
use std::path::{Path, PathBuf};
use std::str::FromStr;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use sqlx::sqlite::{SqliteConnectOptions, SqliteConnection};
use sqlx::{Connection, Executor, Sqlite};
use tauri::{AppHandle, Manager, Runtime};

use crate::DB_FILE_NAME;

/// Nombre de copies conservées par catégorie de sauvegarde automatique.
pub const BACKUP_KEEP: usize = 10;
pub const BACKUP_DIR_NAME: &str = "backups";
/// Version de l'app au dernier démarrage, pour repérer une mise à jour.
const LAST_VERSION_FILE: &str = ".last-app-version";
/// Version inconnue (postes en 2.0.x, antérieurs à ce marqueur).
const UNKNOWN_VERSION: &str = "precedente";

/// Catégories de sauvegardes automatiques (préfixe du nom de fichier).
#[derive(Clone, Copy)]
pub enum BackupKind {
  Startup,
  BeforeRestore,
  BeforeReset,
}

impl BackupKind {
  fn prefix(self) -> &'static str {
    match self {
      BackupKind::Startup => "auto",
      BackupKind::BeforeRestore => "avant-restauration",
      BackupKind::BeforeReset => "avant-reinitialisation",
    }
  }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
  pub name: String,
  pub created_at: u64,
  pub size_bytes: u64,
}

pub fn db_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
  app
    .path()
    .app_config_dir()
    .map_err(|e| format!("Dossier de l'application introuvable : {e}"))
}

pub fn db_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
  Ok(db_dir(app)?.join(DB_FILE_NAME))
}

pub fn backup_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
  let dir = db_dir(app)?.join(BACKUP_DIR_NAME);
  fs::create_dir_all(&dir).map_err(|e| format!("Création du dossier de sauvegardes impossible : {e}"))?;
  Ok(dir)
}

/// Horodatage UTC triable `AAAAMMJJ-HHMMSS` (sans dépendance de fuseau).
pub fn utc_stamp(now: SystemTime) -> String {
  let secs = now.duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
  let (days, rem) = (secs / 86_400, secs % 86_400);
  let (y, m, d) = civil_from_days(days as i64);
  format!(
    "{y:04}{m:02}{d:02}-{:02}{:02}{:02}",
    rem / 3600,
    (rem % 3600) / 60,
    rem % 60
  )
}

/// Date civile depuis un nombre de jours depuis 1970-01-01 (algorithme de H. Hinnant).
fn civil_from_days(z: i64) -> (i64, u32, u32) {
  let z = z + 719_468;
  let era = z.div_euclid(146_097);
  let doe = z.rem_euclid(146_097);
  let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
  let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
  let mp = (5 * doy + 2) / 153;
  let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
  let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
  let y = yoe + era * 400 + i64::from(m <= 2);
  (y, m, d)
}

pub fn backup_file_name<R: Runtime>(app: &AppHandle<R>, kind: BackupKind) -> String {
  let version = app.package_info().version.to_string();
  format!(
    "{}_{}_v{}.db",
    kind.prefix(),
    utc_stamp(SystemTime::now()),
    version
  )
}

/// Ouvre une connexion dédiée (hors pool du plugin) sur un fichier existant.
pub async fn open_connection(path: &Path, read_only: bool) -> Result<SqliteConnection, String> {
  let opts = SqliteConnectOptions::from_str("sqlite:")
    .map_err(|e| e.to_string())?
    .filename(path)
    .create_if_missing(false)
    .read_only(read_only);
  SqliteConnection::connect_with(&opts)
    .await
    .map_err(|e| format!("Ouverture de la base impossible : {e}"))
}

/// Instantané cohérent (`VACUUM INTO`) écrit d'abord dans un fichier temporaire du même
/// dossier, puis renommé : la cible n'est jamais laissée à moitié écrite.
pub async fn vacuum_into<'e, E>(executor: E, target: &Path) -> Result<(), String>
where
  E: Executor<'e, Database = Sqlite>,
{
  let tmp = target.with_extension("db.tmp-actio");
  let _ = fs::remove_file(&tmp);
  let tmp_str = tmp.to_str().ok_or("Chemin de sauvegarde invalide.")?.to_owned();
  executor
    .execute(sqlx::query("VACUUM INTO ?1").bind(tmp_str))
    .await
    .map_err(|e| {
      let _ = fs::remove_file(&tmp);
      format!("Copie de la base impossible : {e}")
    })?;
  fs::rename(&tmp, target).map_err(|e| {
    let _ = fs::remove_file(&tmp);
    format!("Écriture de la sauvegarde impossible : {e}")
  })
}

/// Supprime les plus anciennes copies d'une catégorie au-delà de `BACKUP_KEEP`.
/// Les noms commencent par un horodatage triable : l'ordre alphabétique est chronologique.
pub fn rotate(dir: &Path, kind: BackupKind) -> Result<(), String> {
  let prefix = format!("{}_", kind.prefix());
  let mut files: Vec<PathBuf> = fs::read_dir(dir)
    .map_err(|e| e.to_string())?
    .filter_map(Result::ok)
    .map(|e| e.path())
    .filter(|p| {
      p.extension().is_some_and(|x| x == "db")
        && p
          .file_name()
          .and_then(|n| n.to_str())
          .is_some_and(|n| n.starts_with(&prefix))
    })
    .collect();
  files.sort();
  let excess = files.len().saturating_sub(BACKUP_KEEP);
  for old in files.into_iter().take(excess) {
    if let Err(e) = fs::remove_file(&old) {
      log::warn!("rotation des sauvegardes : suppression impossible de {old:?} : {e}");
    }
  }
  Ok(())
}

/// Sauvegarde automatique au démarrage, avant que le front n'ouvre (et ne migre) la base.
/// Ignorée si la base n'existe pas encore (première installation).
/// Si la version de l'app a changé depuis le dernier démarrage, une copie supplémentaire
/// `pre-upgrade_v<ancienne>_to_v<nouvelle>_<ts>.db` est conservée hors rotation.
pub fn startup_backup<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
  let db = db_path(app)?;
  let dir = backup_dir(app)?;
  let current = app.package_info().version.to_string();
  let marker = dir.join(LAST_VERSION_FILE);
  if !db.exists() {
    return write_marker(&marker, &current);
  }
  let target = dir.join(backup_file_name(app, BackupKind::Startup));
  snapshot_file(&db, &target)?;
  let previous = fs::read_to_string(&marker).ok().map(|v| v.trim().to_owned());
  if previous.as_deref() != Some(current.as_str()) {
    let old = previous.unwrap_or_else(|| UNKNOWN_VERSION.to_owned());
    let name = format!("pre-upgrade_v{old}_to_v{current}_{}.db", utc_stamp(SystemTime::now()));
    fs::copy(&target, dir.join(name)).map_err(|e| format!("Copie avant mise à jour impossible : {e}"))?;
  }
  write_marker(&marker, &current)?;
  rotate(&dir, BackupKind::Startup)
}

fn write_marker(marker: &Path, version: &str) -> Result<(), String> {
  fs::write(marker, version).map_err(|e| format!("Écriture du marqueur de version impossible : {e}"))
}

/// Instantané d'un fichier de base non ouvert par l'app (connexion dédiée), avec repli
/// sur une copie brute si SQLite ne peut pas l'ouvrir (fichier corrompu).
fn snapshot_file(db: &Path, target: &Path) -> Result<(), String> {
  let snapshot = tauri::async_runtime::block_on(async {
    let mut conn = open_connection(db, false).await?;
    let result = vacuum_into(&mut conn, target).await;
    let _ = conn.close().await;
    result
  });
  if let Err(e) = snapshot {
    log::warn!("instantané impossible, copie brute du fichier : {e}");
    fs::copy(db, target).map_err(|e| format!("Copie brute impossible : {e}"))?;
  }
  Ok(())
}

pub fn list_backups<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<BackupInfo>, String> {
  let dir = backup_dir(app)?;
  let mut list: Vec<BackupInfo> = fs::read_dir(&dir)
    .map_err(|e| e.to_string())?
    .filter_map(Result::ok)
    .filter(|e| e.path().extension().is_some_and(|x| x == "db"))
    .filter_map(|e| {
      let meta = e.metadata().ok()?;
      let created_at = meta
        .modified()
        .ok()?
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_millis() as u64;
      Some(BackupInfo {
        name: e.file_name().to_string_lossy().into_owned(),
        created_at,
        size_bytes: meta.len(),
      })
    })
    .collect();
  list.sort_by(|a, b| b.created_at.cmp(&a.created_at));
  Ok(list)
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn utc_stamp_formats_known_instant() {
    // 2026-11-07T11:32:57Z
    let t = UNIX_EPOCH + std::time::Duration::from_secs(1_794_051_177);
    assert_eq!(utc_stamp(t), "20261107-113257");
  }

  #[test]
  fn utc_stamp_handles_leap_day() {
    // 2024-02-29T00:00:00Z
    let t = UNIX_EPOCH + std::time::Duration::from_secs(1_709_164_800);
    assert_eq!(utc_stamp(t), "20240229-000000");
  }
}
