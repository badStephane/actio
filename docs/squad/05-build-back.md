# 05 - Construction Back-End : correctifs de l'audit (Actio 2.1.0)

Branche `audit/pre-prod` (main + v2.0.2). Aucun commit. Contrat : `03-api-contract.md` + avenant A1.

## Hypothèses
- HB1 : tauri-plugin-sql 2.4.0 ouvre la base dans `app_config_dir()/inscriptions.db` (vérifié, wrapper.rs
  `DbPool::connect`). C'est ce chemin qu'utilisent les commandes Rust. Il est égal à APPDATA sous Windows et macOS.
- HB2 : la base n'est pas préchargée (pas de `plugins.sql.preload`). Le hook `setup` passe donc avant toute migration.
- HB3 : sqlx 0.8.6 exécute chaque migration dans une transaction et pose `PRAGMA foreign_keys = ON` sur chaque
  connexion (vérifié dans les sources et par le test : `PRAGMA foreign_keys` = 1).
- HB4 : le plugin lie tous les nombres JS en f64. La colonne INTEGER convertit `5000.0` en `5000`, et
  `CHECK(typeof(amount)='integer')` refuse `1500.5` (vérifié).

## Corrigé (ID de constat → fichier)
| ID | Correction | Fichiers |
|---|---|---|
| B1, QA-01, QA-10, m2, m3 | Commandes `export_database` (dialogue Rust, `VACUUM INTO` vers un fichier temporaire puis renommage) et `restore_database` (contrôles taille 512 o à 500 Mo et en-tête SQLite, copie en zone de transit, `integrity_check`, tables attendues, version ≤ app, **mise à niveau du fichier par les migrations de l'app avant remplacement**, `foreign_key_check`, événement `restored`, sauvegarde `avant-restauration_*`, fermeture du pool, suppression de -wal/-shm/-journal, `rename` atomique, `request_restart`). En cas d'échec du remplacement : boîte d'erreur native, la base actuelle reste intacte | `src-tauri/src/commands.rs`, `backup.rs`, `src/utils/dbBackup.ts` |
| B3, QA-12, D7 | `reset_app_data` : sauvegarde `avant-reinitialisation_*`, puis une transaction qui purge inscriptions, amount_review, contacts, audit, auth_settings et les activités sauf la défaut, puis écrit l'événement `reset` ; redémarrage | `commands.rs::purge_all` |
| SRE B2 | Sauvegarde au démarrage dans `setup` : `backups/auto_<AAAAMMJJ-HHMMSS UTC>_v<version>.db`, 10 copies tournantes. Copie brute en repli si SQLite ne peut pas ouvrir la base. Ignorée en première installation. Erreur loggée, démarrage non bloqué. **En plus**, si la version a changé : `pre-upgrade_v<ancienne>_to_v<nouvelle>_<ts>.db`, hors rotation (marqueur `backups/.last-app-version` ; ancienne version = `precedente` lors du premier passage en 2.1.0) | `backup.rs::startup_backup`, `lib.rs` |
| M6, m1, m2 (SRE), D3 | Retrait de `fs:allow-read-file`, `fs:allow-write-file`, `fs:scope`, `dialog:allow-*`, du plugin fs (Rust et npm). Commandes déclarées par `AppManifest` (build.rs) et autorisées une à une. CSP stricte + `devCsp`. Titre « Actio ». `targets` = nsis, app, dmg. Endpoint `badStephane/actio` en premier | `build.rs`, `capabilities/default.json`, `tauri.conf.json`, `Cargo.toml`, `package.json` |
| B2, QA-02/03/05/16/17/22, m5 | Import : montant et date en valeur brute, autres colonnes en texte affiché (garde le 0 initial). `parseAmountXof` strict. Série Excel via `SSF.parse_date_code`. Chaînes acceptées : ISO ou jj/mm/aaaa seulement, avec contrôle du jour réel. Alias d'en-têtes de notre export (« Montant (F CFA) », « Mode paiement », apostrophe typographique). `missingColumns`, `unrecognizedHeaders`, `totalAmount`, `errors[]` et `amount` par ligne. Limites 5 Mo / 5 000 lignes / 100-200 caractères | `importRegistrations.ts`, `amount.ts`, `dates.ts`, `importContacts.ts` |
| M1, QA-04 | Import atomique : une seule instruction `INSERT ... SELECT FROM json_each($1)` pour toutes les lignes (inscriptions et contacts) | `storage.ts`, `contacts.ts` |
| M2, M3, M4, QA-08/11/20, m6, D2 | Fonctions du contrat. `hasPassword` lève une erreur. `createInitialPassword` n'écrase jamais. `updatePassword` fait un UPDATE et conserve le code. Compteur persistant commun mot de passe / code : 5 essais, puis 30 s doublés à chaque échec jusqu'à 15 min. Code généré : 16 signes de 5 bits (80 bits), alphabet sans I, O, 0, 1, consommé après usage. `MIN_PASSWORD_LENGTH = 8` | `auth.ts` |
| M8, M9, M10, avenant A1 | Migrations 10 (audit), 11 (inscriptions), 12 (auth), détaillées plus bas. `pub fn migrations()` exposée | `schema.rs`, `lib.rs` |
| M9, contrat | `deleteActivity` traduit l'erreur FK en message métier. `countRegistrationsByActivity` (GROUP BY). Montant par défaut validé | `activities.ts` |
| M10, D8 | 7 types système. `logSystemEvent` propage les erreurs. `clearAuditLog` écrit `audit_cleared` AVANT la purge | `audit.ts` |
| A1 | `findSuspiciousRegistrations` / `markReviewed` + cœur pur `detectSuspicious`. Liste vide en démo | `importReview.ts` |
| QA-14, m4, D9 | Doublons sur `personKey` (nom et prénom sans casse ni accents + 9 derniers chiffres du téléphone), partout (formulaire, import, contacts) | `phone.ts`, `storage.ts` |
| m1, QA-18 | `safeCell` anti-formule (numéros exemptés). Dates ISO. Horodatage local | `excelExport.ts` |
| QA-15, D10 | `todayLocalIso` (import, démo, export) | `dates.ts` |
| SRE m10 | Démo : numéros `77 000 00 01` à `12`, annuaire de contacts fictif, `contacts.ts` en mode démo | `demo.ts`, `contacts.ts` |
| SRE M6 | tauri-plugin-log : Warn en release, Info en debug, LogDir `actio.log`, 3 × 1 Mo | `lib.rs::log_plugin` |
| QA7-01, QA7-02 | CSV (extension .csv/.txt/.tsv ou pas de signature zip/OLE) : décodage UTF-8 strict, repli windows-1252, puis `XLSX.read(text, { type: 'string', raw: true })`. Les cellules restent du texte : « 03/04/2026 » est lu 3 avril et les accents sont conservés. xlsx/xls inchangés. Même règle pour les contacts | `spreadsheet.ts` (nouveau), `importRegistrations.ts`, `importContacts.ts` |
| M7 | xlsx 0.20.3 depuis cdn.sheetjs.com (dernière version, vérifiée avec `xlsx-latest`). `npm ls xlsx` = 0.20.3 | `package.json` |
| Release | Version 2.1.0 dans tauri.conf.json, package.json, Cargo.toml (+ les deux lockfiles) | |

## Migrations (1 à 9 inchangées : SHA-384 du SQL identique à HEAD, vérifié par script)
- **10** : `audit_events` reconstruite à l'identique avec les CHECK élargis, index recréé, trigger `audit_events_no_update`.
- **11** : création de `amount_review` et copie des montants non entiers AVANT toute conversion (A1). Activité par
  défaut garantie. Orphelines rattachées à l'activité par défaut. Conversion : non entier < 1000 → `ROUND(x*1000)`,
  sinon `ROUND(x)` ; négatif ou non numérique → 0. **Chaque valeur modifiée laisse un événement `updated`**
  (ancienne et nouvelle valeur dans `details`) : rien ne disparaît en silence. Reconstruction avec
  `amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount >= 0)` et
  `activity_id REFERENCES activities(id) ON DELETE RESTRICT`, index `activity_id` et `created_at`.
- **12** : `auth_settings.failed_attempts` (défaut 0) et `locked_until`.

## ADR d'une ligne
- ADR-B1 : import atomique en **une instruction `json_each`** plutôt qu'une commande Rust transactionnelle. SQLite
  exécute chaque instruction dans une transaction implicite, quelle que soit la connexion du pool, et QA peut le
  tester avec l'adaptateur better-sqlite3. L'événement `imported` part dans une 2e instruction : s'il échoue,
  le message dit que l'import a bien eu lieu et qu'il ne faut pas le relancer.
- ADR-B2 : la restauration **migre le fichier en zone de transit** (migrateur sqlx construit depuis `migrations()`,
  mêmes sommes de contrôle que le plugin) avant de remplacer la base. Un fichier qui ne passe pas la migration
  est refusé sans toucher à la base en service.
- ADR-B3 : les commandes de l'app sont déclarées dans `AppManifest`. Sans permission explicite, le webview ne peut
  pas les appeler.
- ADR-B4 : un import affiche un seul événement `imported` (nombre, total, activités) au lieu d'un `created` par ligne.

## Test de migration (procédure et résultat)
`cd src-tauri && cargo test` (module `src/migration_tests.rs`, vrai chemin sqlx : `Migrator`, une transaction par
migration, foreign_keys ON). Base temporaire migrée en 1→9, puis remplie : 10 inscriptions (5000.0, 1500.5, 2499.4,
**1.5**, -200, 0, une orpheline vers une activité supprimée, **un lot importé** de 3 lignes à 5 F créées dans la
même seconde), 3 activités dont une archivée, 2 contacts, 3 événements, 1 ligne auth avec code de récupération.
Ensuite 10→12, appliquées deux fois (idempotent). Résultat : **5/5 verts**.
- Comptes avant = après (10 / 3 / 2 / 1) : aucune ligne perdue. Tous les montants sont `integer`.
- 1500.5 → 1501, 2499.4 → 2499, 1.5 → 1500, -200 → 0. Lot à 5 inchangé (relève de `importReview`).
- `amount_review` contient r2 1500.5, r3 2499.4, r7 1.5 (`non_integer`). 5 événements de trace, dont l'ancien -200.
- Orpheline → activité par défaut. `pragma_foreign_key_check` vide. Supprimer une activité référencée échoue
  (`FOREIGN KEY`), supprimer une activité vide réussit.
- Insertion de 1500.5 ou de -1 refusée, 5000.0 (f64) acceptée. UPDATE sur l'audit → `AUDIT_IMMUTABLE`. Type `reset`
  accepté. `failed_attempts` = 0 et code de récupération conservé.
- Reset : purge complète, seule l'activité par défaut reste, un seul événement `reset/system`.
- Restauration : une sauvegarde v9 est acceptée, montée en v12, l'événement `restored` est écrit. Une sauvegarde
  « v99 » est refusée (« plus récente »), un fichier non SQLite aussi.

Autres vérifications : `cargo check` et `cargo clippy --all-targets` sans avertissement. `tsc -p tsconfig.app.json`
sans erreur (le Front a déjà migré). `eslint src/utils` propre. Fonctions pures testées sous Node (19 cas de
montant, dates, clés téléphone). Import xlsx de bout en bout (cellule `#,##0`, série 46115, téléphone `0#########`,
« 5,000 » refusé, 31/02 refusé, « 4/3/26 » refusé, doublon +221 détecté) et heuristique A1 testés via esbuild.

Après QA7 : `npm test` 168/168 verts sans `it.fails`. Le repli windows-1252 (CSV Excel FR) a été vérifié hors suite, pour les inscriptions et les contacts.

## Écarts au contrat
- `ParsedRow.amount` vaut 0 quand le montant est illisible (la raison est dans `errors`). `error` est conservé
  pour l'aperçu existant.
- Import : si la colonne paiement est présente mais la cellule vide → erreur (avant : `cash`). Date vide → date du
  jour locale. Montant vide → montant par défaut de l'activité, sinon erreur. Colonnes absentes : `missingColumns`.
- `markReviewed` sur une ligne absente d'`amount_review` crée une ligne `reason = 'manual_review'`.
- `importReview` ne regarde que les inscriptions créées **avant** la migration 11 (`_sqlx_migrations.installed_on`).
  Sinon tout import futur avec jour ≤ 12 serait signalé.
- Ajouts hors contrat (exportés, purs, testables) : `phone.ts`, `isRealDate`, `toIsoDateString`, `lockDurationMs`,
  `normalizeRecoveryCode`, `detectSuspicious`, `safeCell`, `logSystemEvent`, `analyzeHeaders`.

## Ouvert
- Test manuel Windows obligatoire (non exécutable ici) : Sauvegarder, Restaurer (redémarrage, ancien mot de
  passe), Tout effacer, export xlsx sous CSP. Vérifier aussi que `rename` réussit après `pool.close()`
  (verrou de fichier Windows) : en cas d'échec, l'erreur s'affiche et les données restent intactes.
- `targets` multi-plateformes (nsis + app + dmg) : à confirmer par la CI sur les deux jambes.
- `Migrator { ..Migrator::DEFAULT }` s'appuie sur des champs `doc(hidden)` de sqlx 0.8 (version figée par le
  Cargo.lock). À revoir si sqlx passe en 0.9.
- `activities.default_amount` reste en REAL (validé côté TS). Une migration future pourra le passer en INTEGER.
- `src-tauri/permissions/autogenerated/*.toml` sont générés par tauri-build : à committer.
- D6 inchangé : la base reste en clair.
