# Revue Back-End : sécurité et intégrité des données (Actio 0.1.4)

Date : 2026-11-07. Périmètre : `src-tauri/`, `src/utils/*.ts`, composants d'auth et d'import. Lecture seule.

## Hypothèses et méthode
- H2 retenue : la menace est un tiers ayant accès au poste, ou un fichier `.db` / `.xlsx` piégé ou corrompu.
- Vérifié dans le code de l'app et dans les sources des dépendances (`~/.cargo/registry` : tauri-plugin-sql 2.4.0,
  sqlx-sqlite 0.8.6, tauri-plugin-fs 2.5.1). Le comportement de xlsx a été vérifié en exécutant xlsx 0.18.5
  dans un bac à sable (`node_modules` absent du dépôt).
- Pas exécuté : l'app Tauri elle-même. B1 se déduit de l'ACL Tauri (rien n'autorise ces commandes).
  À confirmer par un test manuel de 2 minutes (Sauvegarder, puis Restaurer).
- Points vérifiés et sains : aucune concaténation de saisie utilisateur dans du SQL (seule la constante
  `COLUMNS` est interpolée, tout le reste passe par `$n`). Aucun `dangerouslySetInnerHTML`. Devtools désactivés en release
  (`tauri` sans la feature `devtools`, Cargo.toml:24). `PRAGMA foreign_keys=ON` est posé par sqlx (options/mod.rs:184),
  mais aucune clé étrangère n'est déclarée.
- Fait utile pour les correctifs : le plugin SQL ouvre la base dans `app_config_dir` (wrapper.rs:79-91), alors que
  `dbBackup.ts` vise `appDataDir`. Les deux chemins sont identiques sous Windows et macOS, différents sous Linux.

## Tableau des constats

| ID | Constat (fichier:ligne) | Sévérité | Correction précise |
|---|---|---|---|
| B1 | Sauvegarde et restauration ne marchent pas. Les commandes `copy_file` (dbBackup.ts:24,41) et `sql close` (dbBackup.ts:39) ne sont autorisées nulle part : il manque `fs:allow-copy-file` et `sql:allow-close` (capabilities/default.json:8-38), et c'est le cas depuis le premier commit. Même avec ces permissions, la restauration resterait dangereuse : aucune validation du fichier, aucune sauvegarde avant écrasement, fichiers `-wal`/`-shm`/`-journal` ignorés, et `window.location.reload()` (RegistrationList.tsx:272) ne relance pas les migrations, car le plugin les retire après le premier `load` (plugin commands.rs:20). | Bloquant | Écrire deux commandes Rust, `export_database` et `restore_database`, qui ouvrent la boîte de dialogue côté Rust, utilisent `VACUUM INTO`, valident le fichier, sauvegardent l'existant, remplacent la base de façon atomique puis appellent `app.restart()`. Voir détail. |
| B2 | Import xlsx : les montants avec séparateur de milliers sont divisés par 1000. `sheet_to_json(..., raw:false)` (importRegistrations.ts:176) renvoie le texte formaté, puis `parseAmount` (l.94-95) fait `replace(',', '.')` puis `parseFloat`. Résultat : `"5,000"` donne 5, `"5.000"` donne 5, `"1 500,50"` donne 1500,5. Vérifié en exécution : une cellule 5000 au format `#,##0` est importée à 5 F. Les dates subissent le même sort : xlsx produit `m/d/yy` et la regex française (l.78-86) lit `"4/3/26"` (3 avril) comme le 4 mars, sans aucune erreur. | Bloquant | Lire les valeurs brutes (`raw:true`, sans `cellDates`). Montant : nouvelle fonction `parseAmountXof` qui n'accepte que des entiers. Date : un nombre est converti par `XLSX.SSF.parse_date_code`, une chaîne n'est acceptée qu'au format `jj/mm/aaaa` ou ISO. Voir détail. |
| B3 | « Mot de passe oublié » sans code de récupération (AuthGate.tsx:320, 155-167) : n'importe qui devant le poste efface toutes les inscriptions en 2 clics, sans sauvegarde. `resetAuthAndData` (auth.ts:127-131) laisse en place `audit_events` (le résumé contient nom, prénom et montant, storage.ts:7) et `activities`. Le nouvel utilisateur qui pose son propre mot de passe lit donc tout l'historique nominatif. L'opération n'est ni transactionnelle ni journalisée. | Bloquant | Commande Rust `reset_app_data` : d'abord `VACUUM INTO backups/avant-reinitialisation-<ts>.db`, puis une transaction qui supprime registrations, audit_events, les activités hors activité par défaut et auth_settings, et enfin un événement `reset`. Corriger le message de ConfirmModal (l.334) pour qu'il mentionne la sauvegarde conservée. |
| M1 | La « transaction » de l'import en masse (storage.ts:202-233) envoie `BEGIN`/`INSERT`/`COMMIT` en appels séparés sur un pool sqlx de 10 connexions (wrapper.rs:91, sqlx `max_connections: 10`, et `execute` passe par `pool.execute`). Rien ne garantit que ces appels tombent sur la même connexion. Scénario : `COMMIT` échoue, l'utilisateur voit une erreur, relance l'import et crée des doublons. Une transaction ouverte peut aussi rester pendante sur une connexion. | Majeur | Remplacer la boucle par une seule requête `INSERT ... SELECT ... FROM json_each($1)`, atomique par construction. Supprimer `BEGIN`/`COMMIT`/`ROLLBACK`. Voir détail. |
| M2 | `setPassword` (auth.ts:66-75) exécute `DELETE` puis `INSERT` sans transaction. (a) Chaque changement de mot de passe, y compris celui qui suit une récupération, efface silencieusement le code de récupération (colonnes `recovery_*` de la même ligne). (b) Si l'`INSERT` échoue, la base n'a plus de mot de passe et l'app repasse en écran de création au lancement suivant. | Majeur | Créer deux fonctions : `createInitialPassword` (simple `INSERT`, qui échoue si la ligne existe) et `updatePassword` (`UPDATE ... WHERE id = 1`, qui vérifie `rowsAffected === 1`). |
| M3 | Échec ouvert : si `hasPassword()` lève une erreur (base verrouillée au-delà du `busy_timeout` de 5 s, ou corrompue), l'app passe en phase `setup` (AuthGate.tsx:73-75). L'utilisateur, ou un tiers, crée alors un mot de passe qui écrase l'existant (auth.ts:70), puis accède à tout. | Majeur | Ajouter une phase `error` (message et bouton Réessayer). Ne jamais tomber sur `setup` après une erreur. `handleSetup` appelle `createInitialPassword` (cf. M2), qui refuse d'écraser. |
| M4 | Aucune limite de tentatives, ni sur le mot de passe (AuthGate.tsx:138), ni sur le code de récupération (RecoveryUnlockModal.tsx:62). Le code est choisi par l'utilisateur avec 4 caractères minimum (RecoveryCodeModal.tsx:10) : 4 chiffres, c'est 10 000 essais. Il reste valide après usage (RecoveryUnlockModal.tsx:90). Il est enregistré `trim()` (RecoveryCodeModal.tsx:66) mais vérifié tel quel. | Majeur | Migration 11 : compteur d'échecs persistant et backoff exponentiel. Code de récupération généré par l'app (80 bits), affiché une seule fois et normalisé de la même façon à l'enregistrement et à la vérification. Après une récupération réussie : effacer le code puis proposer d'en générer un nouveau. |
| M5 | Le verrou masque l'écran mais ne protège pas les données. `inscriptions.db` est en clair dans le profil (noms, téléphones, adresses, montants) et le hash du mot de passe est dans la même base. Avec `sqlite3`, on lit tout, ou on supprime `auth_settings` puis on lance l'app. L'UI promet pourtant de « protéger l'application » (AuthGate.tsx:247). | Majeur | Décision PM, à acter dans un ADR. Court terme : texte honnête (« verrouille l'écran, ne chiffre pas les données ») et recommandation BitLocker / FileVault. Moyen terme : SQLCipher, avec une clé dérivée du mot de passe, ce qui demande une couche Rust dédiée. |
| M6 | Surface du webview trop large : `csp: null` (tauri.conf.json:25). `fs:allow-read-file` et `fs:allow-write-file` portent sur `$HOME/**` (default.json:24-37) alors que le front ne les utilise jamais (seul `copyFile` est importé). `sql:allow-execute` autorise du SQL arbitraire. Toute exécution de JS injecté (XSS futur, dépendance piégée, cf. M7) donnerait lecture et écriture sur tout le dossier utilisateur. | Majeur | Une fois B1 fait, retirer les 2 permissions fs et le bloc `fs:scope`. Poser une CSP stricte. Garder `sql:*` limité à `inscriptions.db`. Voir détail. |
| M7 | `xlsx` 0.18.5 est installé (package-lock.json:4997-4998) et il parse des fichiers fournis par l'utilisateur (importRegistrations.ts:172). Deux CVE connues : CVE-2023-30533 (pollution de prototype à la lecture, corrigée en 0.19.3) et CVE-2024-22363 (ReDoS, corrigée en 0.20.2). SheetJS ne publie plus sur npm. | Majeur | `npm i https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (dernière version à confirmer sur cdn.sheetjs.com), puis vérifier `npm ls xlsx`. Limiter la taille du fichier avant la lecture (cf. m5). |
| M8 | Les montants sont stockés en `REAL` (lib.rs:25, 56, 82) et saisis via `parseFloat` (RegistrationForm.tsx:110, 150) : `"1500,5"` et `"5000abc"` sont acceptés, et la migration 2 a mis `amount` à 0 par défaut sur les anciennes lignes. Pour du XOF, cela donne des flottants dans les totaux. | Majeur | Migration 9 : reconstruction des tables avec `amount INTEGER` et un `CHECK` d'entier positif ou nul. Utiliser `parseAmountXof` (B2) dans le formulaire et dans l'import. |
| M9 | `registrations.activity_id` n'a pas de clé étrangère (lib.rs:83). La seule garde contre la suppression d'une activité qui a des inscriptions est dans l'UI, avec un compteur calculé au chargement de la page (Activities.tsx:51, 236). `deleteActivity` (activities.ts:154-166) supprime sans rien vérifier, ce qui laisse des inscriptions orphelines (activité vide à l'export, excelExport.ts:19). | Majeur | Migration 9 : rattacher les orphelines à l'activité par défaut, puis poser `REFERENCES activities(id) ON DELETE RESTRICT` et indexer `activity_id`. Dans `deleteActivity`, traduire l'erreur `FOREIGN KEY constraint failed` en message métier. |
| M10 | Journal d'audit incomplet et effaçable. Le `CHECK` limite à 5 types et 2 entités (lib.rs:97-98) : import, restauration, sauvegarde, reset, changement de mot de passe, usage du code de récupération et effacement du journal ne laissent aucune trace. La journalisation est faite au mieux, hors transaction, et ses erreurs sont avalées (audit.ts:60-76). `clearAuditLog` efface tout sans laisser de trace (audit.ts:91-98). Rien n'empêche l'`UPDATE`. | Majeur | Migration 10 : élargir les types (ajouter l'entité `system`) et ajouter un trigger anti-`UPDATE`. Journaliser les 7 actions listées. `clearAuditLog` écrit un événement `audit_cleared`. Limite à documenter : avec une base en clair (M5), l'immuabilité ne vaut que dans l'app. |
| m1 | L'export Excel ne neutralise pas les cellules qui commencent par `= + - @` (excelExport.ts:18-28). Vérifié : xlsx les stocke en texte (`t:'s'`), donc elles ne s'exécutent pas dans le `.xlsx`. Le risque n'existe que si l'utilisateur réenregistre le fichier en CSV. | Mineur | Créer une fonction `safeCell(v)` qui préfixe `'` quand la valeur correspond à `/^[=+\-@\t\r]/`, et l'appliquer aux champs texte. |
| m2 | Chemin de la base : le plugin utilise `app_config_dir`, alors que dbBackup.ts:23,41 utilise `appDataDir`. Sans effet sous Windows et macOS, faux sous Linux. | Mineur | Dans les commandes Rust de B1, résoudre le chemin via `app.path().app_config_dir()`. |
| m3 | L'export copie le fichier ouvert octet par octet (dbBackup.ts:24). Une écriture concurrente produit une copie incohérente. | Mineur | Couvert par B1 (`VACUUM INTO` fournit un instantané cohérent, WAL ou non). |
| m4 | La détection de doublons compare le téléphone avec `LIKE '%chiffres%'` (storage.ts:84, 94), donc par sous-chaîne, ce qui produit des faux positifs. Aucune contrainte d'unicité. | Mineur | Comparer par égalité stricte sur les chiffres normalisés. Contrainte d'unicité à décider avec le PM (homonymes). |
| m5 | Import sans limite de taille de fichier ni de nombre de lignes, et sans longueur maximale des champs (importRegistrations.ts:170-177, 115-118). | Mineur | Refuser au-delà de 5 Mo et de 5 000 lignes. Tronquer ou refuser les noms au-delà de 100 caractères et les adresses au-delà de 200. |
| m6 | `MIN_PASSWORD_LENGTH` est défini deux fois (AuthGate.tsx:20, RecoveryUnlockModal.tsx:5), avec une valeur de 6. | Mineur | Une seule constante exportée depuis `auth.ts`, portée à 8. |

## Corrections proposées (Bloquants et Majeurs)

**B1. Sauvegarde et restauration côté Rust.** Ajouter `sqlx = { version = "0.8", default-features = false, features = ["sqlite", "runtime-tokio"] }`
dans Cargo.toml (même version que le plugin, pour que `Pool<Sqlite>` soit le même type). L'état du plugin s'obtient par
`State<'_, tauri_plugin_sql::DbInstances>`, puis `DbPool::Sqlite(pool)` (le type est `pub`, mais sa méthode `close` est
`pub(crate)` : appeler `pool.close()` de sqlx). Deux commandes :
- `export_database(app) -> Result<Option<String>, String>` : le dialogue de sauvegarde s'ouvre en Rust
  (`app.dialog().file().blocking_save_file()`), ce qui empêche le JS de choisir un chemin arbitraire. Supprimer la cible si elle existe,
  exécuter `sqlx::query("VACUUM INTO ?1").bind(path).execute(pool)`, puis journaliser `backup_exported`.
- `restore_database(app) -> Result<bool, String>`, dans cet ordre :
  1. Ouvrir le dialogue en Rust. Exiger une taille de fichier entre 512 octets et 500 Mo, et les 16 premiers octets égaux à `b"SQLite format 3\0"`.
  2. Ouvrir le candidat en lecture seule (`SqliteConnectOptions::new().filename(p).read_only(true)`). `PRAGMA integrity_check` doit renvoyer `ok`.
     Les tables `registrations`, `activities`, `auth_settings` et `_sqlx_migrations` doivent exister. `SELECT version, checksum FROM _sqlx_migrations`
     doit être un préfixe exact de la même requête sur la base courante. Sinon, refuser : base d'une version plus récente, ou migrations modifiées,
     ce qui bloquerait le démarrage.
  3. Sauvegarder la base courante : `VACUUM INTO '<config>/backups/avant-restauration-<AAAAMMJJ-HHMMSS>.db'`.
  4. Copier le candidat vers `<config>/inscriptions.db.restore-tmp`, puis `sync_all()`.
  5. `pool.close().await`. Supprimer `inscriptions.db-wal`, `-shm` et `-journal` s'ils existent.
  6. `std::fs::rename(tmp, <config>/inscriptions.db)`, qui remplace la cible de façon atomique sur un même volume, Windows compris.
  7. `app.restart()`, pour que les migrations repassent. Côté JS, appeler `invoke('restore_database')` et retirer `location.reload`.
  En cas d'échec à l'étape 6, renommer la sauvegarde de l'étape 3 en place, puis redémarrer.
Retirer ensuite l'import de `@tauri-apps/plugin-fs` dans dbBackup.ts (cf. M6). Garder une rotation des 10 dernières sauvegardes automatiques.

**B2. Import : montants et dates.** Créer `src/utils/money.ts` avec `export const parseAmountXof = (raw: unknown): number | null`.
- Un nombre n'est accepté que si `Number.isInteger(raw) && raw > 0 && raw <= 100_000_000`.
- Une chaîne : retirer les espaces, y compris ` ` et ` `, ainsi que les suffixes `F`, `FCFA`, `CFA`. Si elle correspond à `/^\d{1,3}([.,]\d{3})+$/`, supprimer les séparateurs.
  Sinon, exiger `/^\d+$/`. Tout le reste renvoie `null`, ce qui rejette `"1500,50"`.

Dans `parseFile`, utiliser `XLSX.read(buffer, { type: 'array' })` et `sheet_to_json(sheet, { defval: '', raw: true })`.
Dans `toIsoDate`, un `number` passe par `XLSX.SSF.parse_date_code(n)` pour obtenir `{y, m, d}` en ISO, sans effet de fuseau.
Une chaîne n'est acceptée qu'en ISO ou en `jj/mm/aaaa`, avec contrôle que le jour et le mois existent vraiment
(`new Date(y, m-1, d).getMonth() === m-1`). Ajouter une colonne « Montant lu » dans l'aperçu de l'import pour que l'opérateur valide visuellement.
Tests unitaires obligatoires : `"5,000"`, `"5.000"`, `"5 000 F"`, `5000`, `"1500,5"` (rejeté), `"4/3/26"` (rejeté), série 46115.

**B3. Reset sûr.** Commande Rust `reset_app_data(app) -> Result<(), String>`, dans cet ordre :
1. `VACUUM INTO backups/avant-reinitialisation-<ts>.db`.
2. `let mut tx = pool.begin()`.
3. `DELETE FROM registrations`, puis `DELETE FROM audit_events`, puis `DELETE FROM activities WHERE id <> '00000000-0000-0000-0000-000000000001'`, puis `DELETE FROM auth_settings`, puis `INSERT` d'un événement `reset` (entité `system`). L'ordre des suppressions respecte la clé étrangère de M9.
4. `tx.commit()`.

Côté JS, `resetAuthAndData` devient `invoke('reset_app_data')`. La sauvegarde rend l'opération réversible pour l'opérateur légitime : restaurer cette sauvegarde ramène aussi l'ancien mot de passe, donc un tiers n'y gagne rien.

**M1. Import atomique sans Rust.** Une seule requête, avec `$1 = JSON.stringify(rows)` où `rows` contient les `id` et `createdAt` générés côté JS :
`INSERT INTO registrations (id, first_name, last_name, phone, address, registration_date, payment_type, amount, activity_id, created_at)
 SELECT json_extract(value,'$.id'), json_extract(value,'$.firstName'), json_extract(value,'$.lastName'), json_extract(value,'$.phone'),
 json_extract(value,'$.address'), json_extract(value,'$.registrationDate'), json_extract(value,'$.paymentType'),
 json_extract(value,'$.amount'), json_extract(value,'$.activityId'), json_extract(value,'$.createdAt') FROM json_each($1)`.
Suivre avec une requête `json_each` identique sur `audit_events` et un événement récapitulatif `imported`. Si l'audit doit être atomique avec l'insertion, passer par une commande Rust avec `pool.begin()` (même dépendance que B1).

**M2 / M3. Mots de passe.** Dans `auth.ts` :
- `createInitialPassword(pw)` : `INSERT INTO auth_settings (id, password_hash, salt, iterations, created_at) VALUES (1,$1,$2,$3,$4)`, sans `DELETE`.
- `updatePassword(pw)` : `UPDATE auth_settings SET password_hash=$1, salt=$2, iterations=$3 WHERE id=1`. Lever une erreur si `rowsAffected !== 1`.
- Supprimer `setPassword`.

Dans AuthGate, `catch` mène à `setPhase('error')`. Après une récupération réussie : appeler `updatePassword`, puis `clearRecoveryCode`, puis ouvrir RecoveryCodeModal. Journaliser `password_changed` et `recovery_used`.

**M4. Limitation des tentatives.** Migration 11 : `ALTER TABLE auth_settings ADD COLUMN failed_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE auth_settings ADD COLUMN locked_until INTEGER;`. Remplacer `verifyPassword` et `verifyRecoveryCode` par
`attemptUnlock(kind: 'password' | 'recovery', secret: string): Promise<{ ok: true } | { ok: false; retryAfterMs: number }>`, qui fonctionne ainsi :
- si `locked_until > now`, refuser sans dériver la clé ;
- en cas d'échec, `failed_attempts + 1`, puis, à partir de 5 échecs, `locked_until = now + min(30 s * 2^(n-5), 15 min)` ;
- en cas de succès, remise à 0.

Le compteur est commun au mot de passe et au code. Code de récupération : 10 octets de `crypto.getRandomValues`, encodés en base32 au format `XXXX-XXXX-XXXX-XXXX`.
Normaliser avec `toUpperCase().replace(/[\s-]/g, '')` à l'enregistrement comme à la vérification.

**M5.** ADR « Confidentialité des données au repos » : comparer le texte honnête plus le chiffrement disque, et SQLCipher (`libsqlite3-sys`
`bundled-sqlcipher`, clé dérivée du mot de passe, migration de la base en clair au premier déverrouillage). L'impact sur B1 et B3 est fort, à arbitrer par le PM.

**M6. CSP et permissions.** Dans tauri.conf.json, valeur de `"csp"` :
`"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ipc: http://ipc.localhost; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'"`.
`unsafe-inline` dans `style-src` est nécessaire pour les styles en ligne de recharts et `style={{}}`. L'updater passe par Rust, donc aucun domaine externe n'est requis.
Dans default.json, supprimer `fs:allow-read-file`, `fs:allow-write-file` et `fs:scope`. Retirer aussi `tauri_plugin_fs` si plus rien ne s'en sert.
Vérifier ensuite l'export xlsx (`XLSX.writeFile`) dans le webview Windows.

**M7.** Mettre à jour xlsx (cf. tableau), relancer le parcours d'import et d'export. Alternative : `exceljs`, qui demande une réécriture plus large.

**M8 / M9. Migration 9** (exécutée dans une transaction sqlx, `foreign_keys` à ON). L'ordre est imposé : reconstruire le parent avant de créer la clé étrangère.
```sql
INSERT OR IGNORE INTO activities (id, name, color, created_at) VALUES ('00000000-0000-0000-0000-000000000001',
  'Inscriptions générales', '#3b82f6', CAST(strftime('%s','now') AS INTEGER) * 1000);
CREATE TABLE activities_v9 (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#3b82f6',
  event_date TEXT, default_amount INTEGER CHECK (default_amount IS NULL OR (default_amount >= 0 AND default_amount = CAST(default_amount AS INTEGER))),
  archived_at INTEGER, created_at INTEGER NOT NULL);
INSERT INTO activities_v9 SELECT id, name, color, event_date, CAST(ROUND(default_amount) AS INTEGER), archived_at, created_at FROM activities;
DROP TABLE activities;
ALTER TABLE activities_v9 RENAME TO activities;
UPDATE registrations SET activity_id = '00000000-0000-0000-0000-000000000001' WHERE activity_id NOT IN (SELECT id FROM activities);
CREATE TABLE registrations_v9 (id TEXT PRIMARY KEY NOT NULL, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL, registration_date TEXT NOT NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('wave','cash','orange_money')),
  amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0 AND amount = CAST(amount AS INTEGER)),
  activity_id TEXT NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES activities(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL);
INSERT INTO registrations_v9 SELECT id, first_name, last_name, phone, address, registration_date, payment_type,
  CAST(ROUND(amount) AS INTEGER), activity_id, created_at FROM registrations;
DROP TABLE registrations;
ALTER TABLE registrations_v9 RENAME TO registrations;
CREATE INDEX registrations_activity_id_idx ON registrations (activity_id);
CREATE INDEX registrations_created_at_idx ON registrations (created_at DESC);
```
Le `CHECK` accepte `amount >= 0`, et non `> 0`, parce que la migration 2 a laissé des lignes à 0. La règle `> 0` reste appliquée en applicatif.
Tester sur une copie d'une base réelle de chaque version (v5 à v8). Prévoir aussi une base contenant des orphelins.

**M10. Migration 10 (audit).** Reconstruire `audit_events` à l'identique, avec deux `CHECK` élargis :
- `event_type IN ('created','updated','deleted','archived','unarchived','imported','restored','backup_exported','reset','password_changed','recovery_used','audit_cleared')` ;
- `entity_type IN ('registration','activity','system')`.

Recréer l'index, puis ajouter `CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events BEGIN SELECT RAISE(ABORT,'AUDIT_IMMUTABLE'); END;`.
Étendre les types TS dans audit.ts:4-5. `logEvent` continue d'avaler les erreurs pour le CRUD, mais doit les propager pour reset, restauration et import.
