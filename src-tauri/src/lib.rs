use tauri_plugin_sql::{Migration, MigrationKind};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let migrations = vec![
    Migration {
      version: 1,
      description: "create_registrations_table",
      sql: "CREATE TABLE IF NOT EXISTS registrations (
              id TEXT PRIMARY KEY NOT NULL,
              first_name TEXT NOT NULL,
              last_name TEXT NOT NULL,
              address TEXT NOT NULL,
              registration_date TEXT NOT NULL,
              payment_type TEXT NOT NULL CHECK(payment_type IN ('wave','cash')),
              created_at INTEGER NOT NULL
            );",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 2,
      description: "add_phone_email_amount",
      sql: "ALTER TABLE registrations ADD COLUMN phone TEXT NOT NULL DEFAULT '';
            ALTER TABLE registrations ADD COLUMN email TEXT;
            ALTER TABLE registrations ADD COLUMN amount REAL NOT NULL DEFAULT 0;",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 3,
      description: "create_auth_settings_table",
      sql: "CREATE TABLE IF NOT EXISTS auth_settings (
              id INTEGER PRIMARY KEY CHECK (id = 1),
              password_hash TEXT NOT NULL,
              salt TEXT NOT NULL,
              iterations INTEGER NOT NULL,
              created_at INTEGER NOT NULL
            );",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 4,
      description: "add_recovery_code_columns",
      sql: "ALTER TABLE auth_settings ADD COLUMN recovery_hash TEXT;
            ALTER TABLE auth_settings ADD COLUMN recovery_salt TEXT;
            ALTER TABLE auth_settings ADD COLUMN recovery_iterations INTEGER;",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 5,
      description: "create_activities_and_link_registrations",
      sql: "CREATE TABLE IF NOT EXISTS activities (
              id TEXT PRIMARY KEY NOT NULL,
              name TEXT NOT NULL,
              color TEXT NOT NULL DEFAULT '#3b82f6',
              event_date TEXT,
              default_amount REAL,
              archived_at INTEGER,
              created_at INTEGER NOT NULL
            );
            INSERT INTO activities (id, name, color, created_at)
            VALUES ('00000000-0000-0000-0000-000000000001', 'Inscriptions générales', '#3b82f6', CAST(strftime('%s', 'now') AS INTEGER) * 1000);
            ALTER TABLE registrations ADD COLUMN activity_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001';",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 6,
      description: "drop_email_from_registrations",
      sql: "ALTER TABLE registrations DROP COLUMN email;",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 7,
      description: "add_orange_money_payment_type",
      sql: "CREATE TABLE registrations_new (
              id TEXT PRIMARY KEY NOT NULL,
              first_name TEXT NOT NULL,
              last_name TEXT NOT NULL,
              phone TEXT NOT NULL DEFAULT '',
              address TEXT NOT NULL,
              registration_date TEXT NOT NULL,
              payment_type TEXT NOT NULL CHECK(payment_type IN ('wave','cash','orange_money')),
              amount REAL NOT NULL DEFAULT 0,
              activity_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
              created_at INTEGER NOT NULL
            );
            INSERT INTO registrations_new (id, first_name, last_name, phone, address, registration_date, payment_type, amount, activity_id, created_at)
              SELECT id, first_name, last_name, phone, address, registration_date, payment_type, amount, activity_id, created_at FROM registrations;
            DROP TABLE registrations;
            ALTER TABLE registrations_new RENAME TO registrations;",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 8,
      description: "create_audit_events_table",
      sql: "CREATE TABLE IF NOT EXISTS audit_events (
              id TEXT PRIMARY KEY NOT NULL,
              event_type TEXT NOT NULL CHECK(event_type IN ('created','updated','deleted','archived','unarchived')),
              entity_type TEXT NOT NULL CHECK(entity_type IN ('registration','activity')),
              entity_id TEXT NOT NULL,
              summary TEXT NOT NULL,
              details TEXT,
              created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS audit_events_created_at_idx ON audit_events (created_at DESC);",
      kind: MigrationKind::Up,
    },
    Migration {
      version: 9,
      description: "create_contacts_directory_table",
      sql: "CREATE TABLE IF NOT EXISTS contacts (
              id TEXT PRIMARY KEY NOT NULL,
              last_name TEXT NOT NULL,
              first_name TEXT NOT NULL,
              phone TEXT NOT NULL DEFAULT '',
              address TEXT NOT NULL DEFAULT '',
              source TEXT,
              created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS contacts_last_first_idx ON contacts (last_name, first_name);
            CREATE INDEX IF NOT EXISTS contacts_phone_idx ON contacts (phone);",
      kind: MigrationKind::Up,
    },
  ];

  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_updater::Builder::new().build())
    .plugin(tauri_plugin_process::init())
    .plugin(
      tauri_plugin_sql::Builder::default()
        .add_migrations("sqlite:inscriptions.db", migrations)
        .build(),
    )
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
