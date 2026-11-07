//! Tests des migrations 10+ sur une base au schéma v9 remplie, via le même chemin que
//! tauri-plugin-sql (Migrator sqlx, une transaction par migration, foreign_keys = ON).

use std::path::PathBuf;
use std::str::FromStr;

use sqlx::sqlite::{SqliteConnectOptions, SqliteConnection, SqlitePoolOptions};
use sqlx::{Connection, Executor};

use crate::commands::{app_migrator, purge_all};

const DEFAULT_ACT: &str = "00000000-0000-0000-0000-000000000001";

fn temp_db(name: &str) -> PathBuf {
  let path = std::env::temp_dir().join(format!("actio-test-{name}-{}.db", std::process::id()));
  let _ = std::fs::remove_file(&path);
  path
}

async fn connect(path: &PathBuf) -> SqliteConnection {
  let opts = SqliteConnectOptions::from_str("sqlite:")
    .unwrap()
    .filename(path)
    .create_if_missing(true);
  SqliteConnection::connect_with(&opts).await.unwrap()
}

const SEED_V9: &str = "
INSERT INTO activities (id, name, color, default_amount, created_at) VALUES ('act-a', 'Gala', '#2563eb', 5000, 1);
INSERT INTO activities (id, name, color, default_amount, archived_at, created_at) VALUES ('act-arch', 'Édition 2025', '#9333ea', 2500.5, 2, 1);
INSERT INTO registrations (id, first_name, last_name, phone, address, registration_date, payment_type, amount, activity_id, created_at) VALUES
  ('r1', 'Awa', 'Diop', '77 000 00 01', 'Médina', '2026-05-01', 'wave', 5000.0, 'act-a', 10),
  ('r2', 'Moussa', 'Ndiaye', '77 000 00 02', 'Yoff', '2026-05-02', 'cash', 1500.5, 'act-a', 11),
  ('r3', 'Fatou', 'Sarr', '77 000 00 03', 'Ouakam', '2026-05-03', 'orange_money', 2499.4, 'act-arch', 12),
  ('r4', 'Cheikh', 'Fall', '77 000 00 04', 'Pikine', '2026-05-04', 'cash', 3000, 'activite-supprimee', 13),
  ('r5', 'Khady', 'Mbaye', '77 000 00 05', 'Point E', '2026-05-05', 'wave', -200, 'act-arch', 14),
  ('r6', 'Modou', 'Cissé', '77 000 00 06', 'Almadies', '2026-05-06', 'cash', 0, 'act-a', 15),
  ('r7', 'Ndèye', 'Faye', '77 000 00 07', 'Yoff', '2026-05-07', 'wave', 1.5, 'act-a', 16),
  ('lot1', 'Ibrahima', 'Sow', '77 000 00 08', 'Thiès', '2026-03-04', 'cash', 5, 'act-a', 1700000000123),
  ('lot2', 'Mariama', 'Gueye', '77 000 00 09', 'Thiès', '2026-03-05', 'cash', 5, 'act-a', 1700000000123),
  ('lot3', 'Ousmane', 'Diallo', '77 000 00 10', 'Thiès', '2026-03-06', 'wave', 5, 'act-a', 1700000000456);
INSERT INTO contacts (id, last_name, first_name, phone, address, source, created_at) VALUES
  ('c1', 'Diop', 'Awa', '770000001', 'Médina', 'liste-1', 1),
  ('c2', 'Ba', 'Aïssatou', '770000007', '', NULL, 2);
INSERT INTO audit_events (id, event_type, entity_type, entity_id, summary, details, created_at) VALUES
  ('e1', 'created', 'activity', 'act-a', 'Gala', NULL, 1),
  ('e2', 'created', 'registration', 'r1', 'Diop Awa · 5 000 F', NULL, 10),
  ('e3', 'deleted', 'activity', 'activite-supprimee', 'Ancienne', NULL, 12);
INSERT INTO auth_settings (id, password_hash, salt, iterations, created_at, recovery_hash, recovery_salt, recovery_iterations)
  VALUES (1, 'hash', 'salt', 100000, 1, 'rhash', 'rsalt', 100000);
";

async fn count(conn: &mut SqliteConnection, table: &str) -> i64 {
  sqlx::query_scalar(&format!("SELECT COUNT(*) FROM {table}"))
    .fetch_one(conn)
    .await
    .unwrap()
}

async fn build_v9(path: &PathBuf) -> SqliteConnection {
  let mut conn = connect(path).await;
  app_migrator(Some(9)).run_direct(&mut conn).await.unwrap();
  conn.execute(SEED_V9).await.unwrap();
  conn
}

#[test]
fn migrations_10_to_12_preserve_v9_data() {
  tauri::async_runtime::block_on(async {
    let path = temp_db("migr");
    let mut conn = build_v9(&path).await;
    let before: Vec<i64> = vec![
      count(&mut conn, "registrations").await,
      count(&mut conn, "activities").await,
      count(&mut conn, "contacts").await,
      count(&mut conn, "auth_settings").await,
    ];

    app_migrator(None).run_direct(&mut conn).await.unwrap();
    // Relancer est sans effet (comme au démarrage suivant de l'app).
    app_migrator(None).run_direct(&mut conn).await.unwrap();

    let after: Vec<i64> = vec![
      count(&mut conn, "registrations").await,
      count(&mut conn, "activities").await,
      count(&mut conn, "contacts").await,
      count(&mut conn, "auth_settings").await,
    ];
    assert_eq!(before, vec![10, 3, 2, 1]);
    assert_eq!(after, before, "aucune ligne perdue");

    let amounts: Vec<(String, i64, String)> =
      sqlx::query_as("SELECT id, amount, typeof(amount) FROM registrations ORDER BY id")
        .fetch_all(&mut conn)
        .await
        .unwrap();
    // Lot importé (montants entiers 5, probablement « 5,000 » mal lu) : inchangé par la migration,
    // il relève du contrôle des imports côté TS (importReview.ts).
    let expected = [
      ("lot1", 5),
      ("lot2", 5),
      ("lot3", 5),
      ("r1", 5000),
      ("r2", 1501),
      ("r3", 2499),
      ("r4", 3000),
      ("r5", 0),
      ("r6", 0),
      ("r7", 1500),
    ];
    assert_eq!(amounts.len(), expected.len());
    for ((id, amount, ty), (eid, eamount)) in amounts.iter().zip(expected) {
      assert_eq!((id.as_str(), *amount, ty.as_str()), (eid, eamount, "integer"));
    }

    let orphan: String = sqlx::query_scalar("SELECT activity_id FROM registrations WHERE id = 'r4'")
      .fetch_one(&mut conn)
      .await
      .unwrap();
    assert_eq!(orphan, DEFAULT_ACT);

    // Avenant A1 : les montants non entiers d'origine sont conservés avant conversion.
    let review: Vec<(String, f64, String, Option<i64>)> = sqlx::query_as(
      "SELECT registration_id, original_amount, reason, reviewed_at FROM amount_review ORDER BY registration_id",
    )
    .fetch_all(&mut conn)
    .await
    .unwrap();
    let review_ids: Vec<(&str, f64)> = review.iter().map(|(id, a, _, _)| (id.as_str(), *a)).collect();
    assert_eq!(review_ids, vec![("r2", 1500.5), ("r3", 2499.4), ("r7", 1.5)]);
    assert!(review.iter().all(|(_, _, reason, at)| reason == "non_integer" && at.is_none()));

    // 3 événements d'origine + 1 rattachement + 4 montants corrigés (r2, r3, r5, r7).
    assert_eq!(count(&mut conn, "audit_events").await, 8);
    let traced: Vec<String> = sqlx::query_scalar(
      "SELECT entity_id FROM audit_events WHERE json_extract(details, '$.migration') = 11 ORDER BY entity_id",
    )
    .fetch_all(&mut conn)
    .await
    .unwrap();
    assert_eq!(traced, vec!["r2", "r3", "r4", "r5", "r7"]);
    let old_negative: f64 = sqlx::query_scalar(
      "SELECT json_extract(details, '$.oldValue') FROM audit_events WHERE entity_id = 'r5' AND json_extract(details, '$.migration') = 11",
    )
    .fetch_one(&mut conn)
    .await
    .unwrap();
    assert_eq!(old_negative, -200.0);

    let fk_on: i64 = sqlx::query_scalar("PRAGMA foreign_keys").fetch_one(&mut conn).await.unwrap();
    assert_eq!(fk_on, 1, "sqlx active foreign_keys sur ses connexions");
    let violations: Vec<(String,)> = sqlx::query_as("SELECT \"table\" FROM pragma_foreign_key_check")
      .fetch_all(&mut conn)
      .await
      .unwrap();
    assert!(violations.is_empty());

    let delete_referenced = conn.execute("DELETE FROM activities WHERE id = 'act-a'").await;
    assert!(delete_referenced.unwrap_err().to_string().contains("FOREIGN KEY"));
    conn.execute("INSERT INTO activities (id, name, created_at) VALUES ('act-vide', 'Vide', 1)").await.unwrap();
    conn.execute("DELETE FROM activities WHERE id = 'act-vide'").await.unwrap();

    let decimal = conn
      .execute("INSERT INTO registrations (id, first_name, last_name, address, registration_date, payment_type, amount, activity_id, created_at) VALUES ('x', 'a', 'b', 'c', '2026-01-01', 'cash', 1500.5, 'act-a', 1)")
      .await;
    assert!(decimal.is_err(), "montant décimal refusé");
    let negative = conn
      .execute("INSERT INTO registrations (id, first_name, last_name, address, registration_date, payment_type, amount, activity_id, created_at) VALUES ('y', 'a', 'b', 'c', '2026-01-01', 'cash', -1, 'act-a', 1)")
      .await;
    assert!(negative.is_err(), "montant négatif refusé");
    conn
      .execute("INSERT INTO registrations (id, first_name, last_name, address, registration_date, payment_type, amount, activity_id, created_at) VALUES ('z', 'a', 'b', 'c', '2026-01-01', 'cash', 5000.0, 'act-a', 1)")
      .await
      .expect("un réel entier (lié en f64 par le plugin) est accepté");

    let update_audit = conn.execute("UPDATE audit_events SET summary = 'x' WHERE id = 'e1'").await;
    assert!(update_audit.unwrap_err().to_string().contains("AUDIT_IMMUTABLE"));
    conn
      .execute("INSERT INTO audit_events (id, event_type, entity_type, entity_id, summary, created_at) VALUES ('s1', 'reset', 'system', 'system', 'ok', 1)")
      .await
      .expect("types système acceptés");

    let (attempts, locked): (i64, Option<i64>) =
      sqlx::query_as("SELECT failed_attempts, locked_until FROM auth_settings WHERE id = 1")
        .fetch_one(&mut conn)
        .await
        .unwrap();
    assert_eq!((attempts, locked), (0, None));
    let recovery: Option<String> = sqlx::query_scalar("SELECT recovery_hash FROM auth_settings WHERE id = 1")
      .fetch_one(&mut conn)
      .await
      .unwrap();
    assert_eq!(recovery.as_deref(), Some("rhash"));

    conn.close().await.unwrap();
    let _ = std::fs::remove_file(&path);
  });
}

#[test]
fn purge_all_keeps_default_activity_and_logs_reset() {
  tauri::async_runtime::block_on(async {
    let path = temp_db("purge");
    let mut conn = build_v9(&path).await;
    app_migrator(None).run_direct(&mut conn).await.unwrap();
    conn.close().await.unwrap();

    let opts = SqliteConnectOptions::from_str("sqlite:").unwrap().filename(&path);
    let pool = SqlitePoolOptions::new().connect_with(opts).await.unwrap();
    purge_all(&pool, "avant-reinitialisation_test.db").await.unwrap();

    let mut conn = pool.acquire().await.unwrap();
    assert_eq!(count(&mut conn, "registrations").await, 0);
    assert_eq!(count(&mut conn, "contacts").await, 0);
    assert_eq!(count(&mut conn, "amount_review").await, 0);
    assert_eq!(count(&mut conn, "auth_settings").await, 0);
    let acts: Vec<String> = sqlx::query_scalar("SELECT id FROM activities")
      .fetch_all(&mut *conn)
      .await
      .unwrap();
    assert_eq!(acts, vec![DEFAULT_ACT]);
    let events: Vec<(String, String)> = sqlx::query_as("SELECT event_type, entity_type FROM audit_events")
      .fetch_all(&mut *conn)
      .await
      .unwrap();
    assert_eq!(events, vec![("reset".to_string(), "system".to_string())]);
    drop(conn);
    pool.close().await;
    let _ = std::fs::remove_file(&path);
  });
}

#[test]
fn restore_validation_upgrades_old_backup_and_rejects_newer() {
  tauri::async_runtime::block_on(async {
    // Sauvegarde v9 : acceptée, mise à niveau, restauration journalisée.
    let old = temp_db("restore-old");
    let conn = build_v9(&old).await;
    conn.close().await.unwrap();
    let staging = temp_db("restore-staging");
    crate::commands::prepare_staging(&old, &staging).await.unwrap();
    let mut conn = connect(&staging).await;
    let version: i64 = sqlx::query_scalar("SELECT MAX(version) FROM _sqlx_migrations")
      .fetch_one(&mut conn)
      .await
      .unwrap();
    assert_eq!(version, crate::commands::app_schema_version());
    let restored: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM audit_events WHERE event_type = 'restored'")
      .fetch_one(&mut conn)
      .await
      .unwrap();
    assert_eq!(restored, 1);
    assert_eq!(count(&mut conn, "registrations").await, 10);
    conn.close().await.unwrap();

    // Sauvegarde d'une version plus récente : refusée.
    let newer = temp_db("restore-newer");
    let mut conn = build_v9(&newer).await;
    conn
      .execute("INSERT INTO _sqlx_migrations (version, description, success, checksum, execution_time) VALUES (99, 'future', 1, x'00', 0)")
      .await
      .unwrap();
    conn.close().await.unwrap();
    let err = crate::commands::prepare_staging(&newer, &staging).await.unwrap_err();
    assert!(err.contains("plus récente"), "{err}");

    // Fichier qui n'est pas une base SQLite : refusé.
    let junk = temp_db("restore-junk");
    std::fs::write(&junk, vec![b'x'; 4096]).unwrap();
    let err = crate::commands::prepare_staging(&junk, &staging).await.unwrap_err();
    assert!(err.contains("SQLite"), "{err}");

    for p in [old, newer, junk, staging] {
      let _ = std::fs::remove_file(p);
    }
  });
}
