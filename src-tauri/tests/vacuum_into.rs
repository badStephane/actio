//! QA (P7) : la sauvegarde manuelle, la sauvegarde au démarrage et les copies avant
//! restauration / réinitialisation reposent toutes sur `VACUUM INTO ?1` avec un chemin lié en
//! paramètre (backup.rs::vacuum_into). Ce test prouve que SQLite (version embarquée par sqlx)
//! accepte cette forme et produit une copie complète et cohérente, migrations comprises.

use std::str::FromStr;

use sqlx::migrate::{Migration, MigrationType, Migrator};
use sqlx::sqlite::{SqliteConnectOptions, SqliteConnection};
use sqlx::{Connection, Executor};

fn temp_path(name: &str) -> std::path::PathBuf {
  let path = std::env::temp_dir().join(format!("actio-qa-{name}-{}.db", std::process::id()));
  let _ = std::fs::remove_file(&path);
  path
}

async fn open(path: &std::path::Path, create: bool) -> SqliteConnection {
  let opts = SqliteConnectOptions::from_str("sqlite:")
    .unwrap()
    .filename(path)
    .create_if_missing(create);
  SqliteConnection::connect_with(&opts).await.unwrap()
}

#[test]
fn vacuum_into_bound_path_copies_migrated_database() {
  tauri::async_runtime::block_on(async {
    let source = temp_path("vacuum-src");
    let target = temp_path("vacuum-dst");
    let mut conn = open(&source, true).await;

    let list: Vec<Migration> = app_lib::migrations()
      .into_iter()
      .map(|m| Migration::new(m.version, m.description.into(), MigrationType::ReversibleUp, m.sql.into(), false))
      .collect();
    assert_eq!(list.iter().map(|m| m.version).collect::<Vec<_>>(), (1..=12).collect::<Vec<i64>>());
    let migrator = Migrator { migrations: std::borrow::Cow::Owned(list), ..Migrator::DEFAULT };
    migrator.run_direct(&mut conn).await.unwrap();
    conn
      .execute("INSERT INTO registrations (id, first_name, last_name, address, registration_date, payment_type, amount, created_at) VALUES ('r1', 'Awa', 'Diop', 'Médina', '2026-05-15', 'wave', 5000, 1)")
      .await
      .unwrap();

    conn
      .execute(sqlx::query("VACUUM INTO ?1").bind(target.to_str().unwrap().to_owned()))
      .await
      .expect("VACUUM INTO avec chemin lié");
    conn.close().await.unwrap();

    let mut copy = open(&target, false).await;
    let integrity: String = sqlx::query_scalar("PRAGMA integrity_check").fetch_one(&mut copy).await.unwrap();
    assert_eq!(integrity, "ok");
    let (n, version): (i64, i64) = sqlx::query_as(
      "SELECT (SELECT COUNT(*) FROM registrations), (SELECT MAX(version) FROM _sqlx_migrations)",
    )
    .fetch_one(&mut copy)
    .await
    .unwrap();
    assert_eq!((n, version), (1, 12));
    // La copie se rouvre avec le même migrateur sans VersionMismatch (sommes de contrôle identiques).
    migrator.run_direct(&mut copy).await.unwrap();
    copy.close().await.unwrap();

    let _ = std::fs::remove_file(source);
    let _ = std::fs::remove_file(target);
  });
}
