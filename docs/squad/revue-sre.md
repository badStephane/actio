# Revue SRE avant prod : release, updater, CI, sauvegarde, observabilité (Actio)

Date : 2026-11-07. Mode : revue en lecture seule. Branche examinée : `main` @ 3a36368.

## Hypothèses et preuves collectées
- gh authentifié (compte badStephane) : releases, runs et assets lus via `gh` en lecture seule.
- Le dépôt `badStephane/Gestion_Inscription` a été renommé `badStephane/actio` ; l'endpoint updater historique
  répond `301` vers `actio` puis `302` vers l'asset `latest.json` de v2.0.2 (vérifié par `curl -sIL`).
- Parc installé : petit (latest.json v2.0.2 téléchargé 5 fois, setup.exe 5 fois). Version servie : **2.0.2**.
- `node_modules` absent en local : `npm run lint` et `tsc` n'ont pas été exécutés ; leur état réel est inconnu.
- Sources des plugins lues dans `~/.cargo/registry` aux versions du `Cargo.lock` : tauri-plugin-sql 2.4.0,
  sqlx-sqlite 0.8.6, tauri-plugin-updater 2.10.1, tauri-plugin-log 2.8.0.

## Points vérifiés et jugés corrects
- `needs: build` attend les deux jambes de la matrice ; si une jambe échoue, le job manifeste est sauté (voir M1).
- macOS universel : un seul `.app.tar.gz` sert `darwin-aarch64` et `darwin-x86_64`, même `.sig` : correct.
- Windows : `createUpdaterArtifacts: true` (pas `v1Compatible`) produit `*-setup.exe` + `.exe.sig`, pas de
  `nsis.zip`. Le script retombe bien sur le setup.exe (latest.json v2.0.2 vérifié). La branche `nsis.zip` est du code mort.
- `pubkey` présente ; hors ligne, `check()` échoue et l'erreur est avalée sans bloquer l'app (UpdateChecker.tsx:25-28).
- sqlx n'impose pas WAL (sqlx-sqlite options/mod.rs:177-181) : journal `DELETE`, une copie du `.db` hors transaction
  est cohérente. Chaque migration sqlx tourne dans une transaction : un échec SQL est annulé, une migration
  logiquement fausse ne l'est pas.
- Permissions par défaut du workflow du dépôt : `read`. Aucun secret ni URL externe dans le bundle web : seule
  variable lue `VITE_DEMO_MODE` (demo.ts:15, aucun autre `import.meta.env` dans `src/`).

## Tableau des constats (trié par sévérité)

| ID | Constat (fichier:ligne) | Sévérité | Correction précise |
|---|---|---|---|
| B1 | `main` a divergé de la version en service : v2.0.0/2.0.1/2.0.2 (commits 89631e8..c1c456d) ne sont **pas** ancêtres de `main` (`git merge-base --is-ancestor v2.0.2 HEAD` faux). v2.0.2 contient la migration 9 `create_contacts_directory_table` ; `main` s'arrête à 8 (src-tauri/src/lib.rs:92-107). sqlx refuse une base ayant une migration appliquée inconnue (`VersionMissing`, sqlx-core migrate/migrator.rs:40, `ignore_missing=false` via tauri-plugin-sql commands.rs:22). Toute release taguée depuis `main` rend la base **illisible sur tous les postes en 2.0.2**, et supprime l'annuaire de contacts et le correctif d'import multi-lignes. | Bloquant | Réintégrer la ligne v2.0.x dans `main` (merge de `v2.0.2`), migration 9 recopiée à l'identique ; ajouter un garde-fou CI « la dernière release est ancêtre du tag et ses migrations sont un préfixe des nôtres ». |
| B2 | Aucune sauvegarde automatique : seule la copie manuelle existe (src/utils/dbBackup.ts:14-26) ; les migrations s'exécutent à l'ouverture après mise à jour sans copie préalable (lib.rs:114-118) ; une version antérieure ne peut plus ouvrir une base migrée (même mécanisme que B1). Perte du poste, fichier corrompu ou migration fautive = perte totale. | Bloquant | Copie tournante au démarrage dans `APPDATA/backups/` (10 copies, nom horodaté + version) côté Rust, avant toute ouverture de la base. Code ci-dessous. |
| M1 | La release devient « Latest » dès que la première jambe attache ses fichiers (`softprops/action-gh-release` sans `draft`, build.yml:115-126) ; `latest.json` n'est ajouté que plus tard par un autre job (128-202). Si une jambe échoue, le manifeste n'est jamais publié et `/releases/latest/download/latest.json` renvoie 404 : mises à jour gelées pour tout le parc. Un tag `v2.1.0-rc.1` est publié comme stable et poussé au parc (semver le juge > 2.0.2). Aucune recette entre tag et parc. | Majeur | Release créée en **brouillon**, assets ajoutés, manifeste validé, puis publication explicite ; tags avec `-` publiés en pre-release (ignorée par `/releases/latest`). |
| M2 | Manifeste généré sans validation : `read_sig` renvoie `""` si fichier absent (build.yml:155-171), `if-no-files-found: ignore` (113), softprops n'échoue pas sur un glob vide (`fail_on_unmatched_files` à false par défaut). Un `url` vide fait échouer la désérialisation (`url: Url`, tauri-plugin-updater updater.rs:72-77) donc `check()` échoue sur **toutes** les plateformes. | Majeur | Construire `latest.json` avec `jq`, URLs reconstruites, et échouer si une signature ou URL manque (voir correction M1/M2). |
| M3 | Aucune porte qualité : ni lint, ni typecheck, ni test avant le build (build.yml:52-99) ; `npm run build` = `vite build` sans `tsc` (package.json:8). | Majeur | Job `checks` (lint + `tsc --noEmit` + tests si présents) sur PR et `main`, `build` en `needs: checks`. |
| M4 | Chaîne d'approvisionnement : actions tierces épinglées par tag mobile (build.yml:33,36,42,47,102,117,139) ; la clé de signature updater et son mot de passe sont écrits dans `GITHUB_ENV` (95-96) donc visibles par **toutes** les étapes suivantes, y compris `softprops`, avec `contents: write` (25-26) même sur push `main`. Dépôt public. Une action compromise obtient clé + jeton d'écriture = mise à jour malveillante signée vers tout le parc. | Majeur | Épingler par SHA, passer les secrets uniquement à l'étape `Build Tauri` via `env:`, `permissions: contents: read` par défaut, `write` seulement dans les jobs de release, Dependabot pour `github-actions`. |
| M5 | Chaque mise à jour Windows télécharge **196 Mo** (asset v2.0.2) car WebView2 hors ligne est embarqué (tauri.conf.json:39-43) ; cible terrain en données mobiles payées au Mo. | Majeur | Garder l'installeur hors ligne pour la première installation, mais servir à l'updater un setup construit avec `webviewInstallMode: skip` (WebView2 déjà présent sur un poste à jour). |
| M6 | Aucun diagnostic en prod : `tauri-plugin-log` chargé seulement en debug (lib.rs:120-126) ; erreurs updater uniquement en `console` (UpdateChecker.tsx:27,51). | Majeur | Log fichier rotatif en release, niveau `warn`, cible `LogDir` (3 fichiers de 1 Mo). |
| M7 | Pas de signature Authenticode : SmartScreen « Windows a protégé votre ordinateur » et faux positifs Defender à la première installation (H1 : Windows principal). Les mises à jour via l'updater ne sont pas concernées (pas de Mark-of-the-Web). | Majeur | Court terme : procédure d'installation illustrée (« Informations complémentaires > Exécuter quand même »). Cible : Azure Trusted Signing ou SignPath (gratuit pour dépôt public) via `bundle.windows.signCommand`. |
| m1 | `targets: "all"` publie un MSI (tauri.conf.json:30) jamais téléchargé (0 sur 9 releases). S'il était installé, l'updater ne trouve pas `windows-x86_64-msi` et lance le setup NSIS (updater.rs:578-585) : double installation. | Mineur | `"targets": ["nsis", "app", "dmg"]` et retirer les globs `msi` de build.yml. |
| m2 | Endpoint sur l'ancien nom de dépôt (tauri.conf.json:51) : redirection 301 fonctionnelle mais casse si un dépôt `Gestion_Inscription` est recréé. | Mineur | Mettre `https://github.com/badStephane/actio/releases/latest/download/latest.json` en premier, garder l'ancien en second ; ne jamais recréer `Gestion_Inscription`. |
| m3 | Versions incohérentes : dépôt `0.1.4` (tauri.conf.json:4, package.json:4) contre 2.0.2 servie ; Cargo.toml:3 `0.1.0`, `description = "A Tauri App"`, `authors = ["you"]`. Sans effet runtime (Tauri lit la version de tauri.conf), mais builds locaux faux et réécriture CI non tracée (build.yml:55-73). | Mineur | Commiter la version avant le tag (tauri.conf, package.json, Cargo.toml) ; en CI, **vérifier** l'égalité tag/version au lieu de réécrire. |
| m4 | Notes de version vides (body `""` vérifié sur v2.0.2) et `notes` générique (build.yml:176) affiché dans l'app (UpdateChecker.tsx:96-104). | Mineur | `gh release create --generate-notes` et recopier le body dans `latest.json.notes`. |
| m5 | Build complet et signé à chaque push `main` (build.yml:4-5), artefacts inutilisés. | Mineur | Déclencher `build` sur tags `v*` et `workflow_dispatch` ; `main`/PR ne lancent que `checks`. |
| m6 | Node 20 en fin de vie (build.yml:38). | Mineur | `node-version: '22'`. |
| m7 | `productName` et titre de fenêtre « Gestion des Inscriptions » (tauri.conf.json:3,15) ; `document.title` forcé à « Système d'Inscriptions » (src/main.tsx:7). Changer `productName` renomme l'exe, le dossier, les raccourcis et la clé de désinstallation NSIS : risque de double installation via l'updater. APPDATA dépend de l'`identifier`, données sûres. | Mineur | Ne pas changer `productName` dans cette release ; changer seulement `app.windows[0].title` en « Actio » (Front : `main.tsx:7`). Renommage complet = chantier dédié testé en VM. |
| m8 | macOS non signé ni notarisé : Gatekeeper bloque la première ouverture. Plateforme secondaire (H1). | Mineur | Documenter « Réglages > Confidentialité > Ouvrir quand même » ; notarisation si macOS devient cible. |
| m9 | Démo Vercel sans en-têtes de sécurité ni `noindex` (vercel.json:1-10). | Mineur | Bloc `headers` ci-dessous. |
| m10 | Numéros de démo au format réel sénégalais (src/utils/demo.ts:88-99), pouvant appartenir à de vraies personnes. | Mineur | Utiliser une plage manifestement fictive : `77 000 00 01` à `77 000 00 12`. |
| m11 | Vérification de mise à jour uniquement au démarrage, pas de bouton manuel (UpdateChecker.tsx:15-33). | Mineur | Bouton « Rechercher une mise à jour » dans Préférences (Front). |

## Corrections proposées (Bloquants et Majeurs)

### B1 : réintégrer la version en service et verrouiller l'historique des migrations
```bash
git switch -c fix/reintegre-v2 main
git merge v2.0.2            # conflits attendus : App.tsx, storage.ts, demo.ts, lib.rs
git diff v2.0.2 -- src-tauri/src/lib.rs   # migrations 1 à 9 strictement identiques
```
Back et Front résolvent les conflits (le mode démo doit couvrir les fonctions contacts). Si l'annuaire est
abandonné, la migration 9 reste **quand même** dans la liste, à l'identique. Garde-fou dans le job de release
(checkout avec `fetch-depth: 0`) :
```yaml
      - name: Garde-fou historique et migrations
        shell: bash
        env: { GH_TOKEN: "${{ secrets.GITHUB_TOKEN }}" }
        run: |
          PREV=$(gh release view --repo "$GITHUB_REPOSITORY" --json tagName --jq .tagName)
          git merge-base --is-ancestor "$PREV" HEAD || { echo "::error::$PREV non ancêtre"; exit 1; }
          OLD=$(git show "$PREV:src-tauri/src/lib.rs" | grep -oE 'version: [0-9]+')
          NEW=$(grep -oE 'version: [0-9]+' src-tauri/src/lib.rs | head -n "$(echo "$OLD" | wc -l)")
          [ "$OLD" = "$NEW" ] || { echo "::error::migrations publiées modifiées"; exit 1; }
```

### B2 : sauvegarde automatique tournante au démarrage (src-tauri/src/lib.rs)
Faisable sans dépendance nouvelle : la base n'est pas préchargée (pas de `plugins.sql.preload`), elle n'est ouverte
qu'au premier `Database.load` du front, donc après le hook `setup`. La copie précède toute migration.
```rust
use std::{fs, time::{SystemTime, UNIX_EPOCH}};
use tauri::Manager;
const BACKUP_KEEP: usize = 10;

fn rotate_backup(app: &tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
  let dir = app.path().app_data_dir()?;
  let db = dir.join("inscriptions.db");
  if !db.exists() { return Ok(()); }
  let backups = dir.join("backups");
  fs::create_dir_all(&backups)?;
  let stamp = SystemTime::now().duration_since(UNIX_EPOCH)?.as_secs();
  let version = app.package_info().version.to_string();
  fs::copy(&db, backups.join(format!("inscriptions_{stamp}_v{version}.db")))?;
  let mut files: Vec<_> = fs::read_dir(&backups)?.filter_map(Result::ok).map(|e| e.path())
    .filter(|p| p.extension().is_some_and(|x| x == "db")).collect();
  files.sort();
  let excess = files.len().saturating_sub(BACKUP_KEEP);
  files.into_iter().take(excess).for_each(|old| { let _ = fs::remove_file(old); });
  Ok(())
}
// dans .setup(|app| { ... }) : if let Err(e) = rotate_backup(app.handle()) { log::error!("sauvegarde auto: {e}"); }
```
Ne protège pas de la perte du poste : le PM tranche un rappel d'export externe (clé USB) hebdomadaire affiché
dans l'app (Front). Restauration : quitter l'app, copier la sauvegarde voulue sur `inscriptions.db`.

### M1 et M2 : brouillon, manifeste validé, publication explicite
1. Nouveau job `create-release` (tags seulement) : `gh release create "$TAG" --draft --verify-tag --generate-notes`
   plus `--prerelease` si `[[ "$TAG" == *-* ]]`.
2. Jambes `build` : remplacer softprops par `gh release upload "$TAG" <fichiers> --clobber` et échouer si un
   fichier attendu manque (`ls` explicite avant upload).
3. Job manifeste : URLs **reconstruites** (les URLs d'assets d'un brouillon contiennent `untagged-...`), puis :
```bash
BASE="https://github.com/$REPO/releases/download/$TAG"
WIN_NAME=$(gh release view "$TAG" -R "$REPO" --json assets --jq '.assets[].name|select(endswith("-setup.exe"))')
MAC_NAME=$(gh release view "$TAG" -R "$REPO" --json assets --jq '.assets[].name|select(endswith(".app.tar.gz"))')
WIN_SIG=$(cat sigs/"$WIN_NAME".sig); MAC_SIG=$(cat sigs/"$MAC_NAME".sig)
for v in "$WIN_NAME" "$MAC_NAME" "$WIN_SIG" "$MAC_SIG"; do [ -n "$v" ] || { echo "::error::manifeste incomplet"; exit 1; }; done
NOTES=$(gh release view "$TAG" -R "$REPO" --json body --jq .body)
jq -n --arg v "$VERSION" --arg n "$NOTES" --arg d "$PUB_DATE" \
  --arg wu "$BASE/$WIN_NAME" --arg ws "$WIN_SIG" --arg mu "$BASE/$MAC_NAME" --arg ms "$MAC_SIG" \
  '{version:$v,notes:$n,pub_date:$d,platforms:{"windows-x86_64":{url:$wu,signature:$ws},
    "darwin-aarch64":{url:$mu,signature:$ms},"darwin-x86_64":{url:$mu,signature:$ms}}}' > latest.json
gh release upload "$TAG" latest.json -R "$REPO" --clobber
gh release edit "$TAG" -R "$REPO" --draft=false $([[ "$TAG" == *-* ]] && echo --prerelease || echo --latest)
```
Tant qu'un job échoue, la release reste brouillon et le parc continue de voir la version précédente.

### M3 : porte qualité
```yaml
on: { pull_request: {}, push: { branches: [main], tags: ['v*'] }, workflow_dispatch: {} }
jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with: { node-version: '22', cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npx tsc -p tsconfig.app.json --noEmit
      - run: npm test --if-present
  build:
    needs: checks
    if: startsWith(github.ref, 'refs/tags/v') || github.event_name == 'workflow_dispatch'
```
Ajouter `cargo clippy -- -D warnings` dans la jambe Windows quand des tests Rust existent (QA décide des tests bloquants).

### M4 : réduire la surface de la clé de signature
- En tête de workflow : `permissions: { contents: read }` ; `contents: write` seulement dans `create-release`,
  les jambes `build` (tags) et le job manifeste.
- SHAs relevés le 2026-11-07 : upload-artifact `ea165f8d65b6e75b540449e92b4886f43607fa02` (v4),
  action-gh-release `3bb12739c298aeb8a4eeaf626c5b8d85266b0e65` (v2), rust-cache `d1527c8f67ef9af357290475d4af4b0fab8f12e0` (v2),
  rust-toolchain `b725eda525362e7cf34af9a7243cac1e3f01a7ec` (stable) ; checkout et setup-node : voir M3.
- Supprimer les deux `echo ... >> "$GITHUB_ENV"` (build.yml:95-96) ; l'étape de préparation écrit seulement le fichier
  clé, et l'étape `Build Tauri` reçoit `env: { TAURI_SIGNING_PRIVATE_KEY: "${{ runner.temp }}/tauri-signing.key",
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}" }` ; `rm -f` de la clé en
  étape `if: always()`.
- `.github/dependabot.yml` : `package-ecosystem: github-actions`, `interval: weekly`.

### M5 : setup d'update léger
Fichier `src-tauri/tauri.update.conf.json` : `{ "bundle": { "windows": { "webviewInstallMode": { "type": "skip" } } } }`.
Dans la jambe Windows, après le build principal : renommer le setup complet, puis
`npm run tauri:build -- --bundles nsis --config src-tauri/tauri.update.conf.json`, renommer la sortie en
`*_x64-update-setup.exe` (+ `.sig`, la signature minisign porte sur le contenu) et pointer `windows-x86_64` dessus.
Gain attendu : de 196 Mo à environ 5 Mo par mise à jour (à mesurer). Risque : un poste dont WebView2 a été
désinstallé ; contournement, réinstaller avec le setup complet.

### M6 : log fichier en release (lib.rs:119-127)
```rust
use tauri_plugin_log::{RotationStrategy, Target, TargetKind};
// remplacer le bloc if cfg!(debug_assertions) { ... } par :
app.handle().plugin(
  tauri_plugin_log::Builder::default()
    .level(if cfg!(debug_assertions) { log::LevelFilter::Info } else { log::LevelFilter::Warn })
    .targets([Target::new(TargetKind::LogDir { file_name: Some("actio".into()) })])
    .max_file_size(1_000_000)
    .rotation_strategy(RotationStrategy::KeepSome(3))
    .build(),
)?;
```
Fichier : `%LOCALAPPDATA%\com.badstephane.gestion-inscription\logs\actio.log`. Pour capter les erreurs du front
(updater, SQL), ajouter `@tauri-apps/plugin-log` et la permission `log:default`, puis remplacer les `console.error`
critiques par `error()` (Front). Ne jamais journaliser de données d'inscrits (noms, téléphones).

### Démo Vercel (m9), bloc à ajouter dans vercel.json
```json
"headers": [{ "source": "/(.*)", "headers": [
  { "key": "Content-Security-Policy", "value": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'" },
  { "key": "X-Content-Type-Options", "value": "nosniff" },
  { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
  { "key": "Permissions-Policy", "value": "camera=(), microphone=(), geolocation=()" },
  { "key": "X-Robots-Tag", "value": "noindex" } ] }]
```

## Runbook : release et rollback
Release (jamais le vendredi soir) :
1. Vérifier `git merge-base --is-ancestor <dernier tag publié> HEAD` et que les migrations publiées sont inchangées.
2. Monter la version dans tauri.conf.json, package.json, Cargo.toml ; PR, CI `checks` verte, merge.
3. Tester l'installeur du run précédent en VM Windows avec une **copie** de base réelle anonymisée en version N-1.
4. `git tag vX.Y.Z && git push origin vX.Y.Z` (rc : `vX.Y.Z-rc.N`, publié en pre-release, parc non touché).
5. Attendre le brouillon complet : 2 jambes vertes, `latest.json` validé, publication automatique.
6. Contrôle : `curl -sL https://github.com/badStephane/actio/releases/latest/download/latest.json | jq .version`.
7. Mettre à jour un poste pilote, vérifier ouverture de la base, inscriptions, export, puis prévenir les opérateurs.
Rollback (l'updater ne rétrograde jamais : la version servie doit être supérieure) :
8. Problème détecté avant mise à jour des postes : `gh release edit vX.Y.Z --draft=true` ; `/latest` doit revenir à N-1 (contrôler avec la commande de l'étape 6).
9. Problème après mise à jour : publier en urgence `vX.Y.Z+1` depuis le code N-1 **en conservant toutes les
   migrations déjà livrées** (sinon `VersionMissing`, base illisible).
10. Base endommagée sur un poste : fermer l'app, copier `backups/inscriptions_<horodatage>_v<N-1>.db` sur
    `inscriptions.db` dans APPDATA, relancer, contrôler le nombre d'inscriptions.
11. Clé de signature exposée : nouvelle paire, nouvelle `pubkey`, release signée **avec l'ancienne clé** portant la
    nouvelle `pubkey`, puis révocation.
