// Les commandes de l'app sont déclarées explicitement : seules celles autorisées dans
// capabilities/default.json sont appelables depuis le webview.
const APP_COMMANDS: &[&str] = &[
  "export_database",
  "restore_database",
  "reset_app_data",
  "list_auto_backups",
];

fn main() {
  tauri_build::try_build(
    tauri_build::Attributes::new()
      .app_manifest(tauri_build::AppManifest::new().commands(APP_COMMANDS)),
  )
  .expect("échec de la génération Tauri");
}
