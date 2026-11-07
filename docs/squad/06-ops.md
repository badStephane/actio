# 06 - Ops : chaîne de release, garde-fous et SLO (Actio, P6)

Date : 2026-11-07. Branche : `audit/pre-prod` @ e0eb472 (fusion v2.0.2, migrations 1 à 9). Rôle : SRE.

## Hypothèses
- Dépôt public `badStephane/actio`, propriétaire unique avec droit d'écriture : lui seul peut lancer la publication.
- Le Back livre en parallèle B2 (dans `app_config_dir\backups\` : 10 copies tournantes `auto_<ts>_v<version>.db`
  et une copie hors rotation `pre-upgrade_v<ancienne>_to_v<nouvelle>_<ts>.db` à chaque changement de version), M6 (log `LogDir/actio.log`), m1 (`targets` sans MSI), m2 (endpoint `actio` en premier).
  `docs/RELEASE.md` s'appuie sur ces noms ; à revérifier quand le Back aura fini.
- Aucune télémétrie dans l'app (100 % locale) : les SLO s'appuient sur l'API GitHub et le poste pilote.

## Corrigé (ID de la revue SRE → fichier)

| ID | Correction | Fichier |
|---|---|---|
| B1 (garde-fou) | Le tag de la release publiée (API `releases/latest`) doit être ancêtre de HEAD ; migrations publiées présentes, `kind` et SQL **identiques au caractère près** ; nouvelles versions > dernière publiée, sans doublon | `scripts/check-migrations.mjs`, `scripts/lib/migrations.mjs`, job `checks` |
| M1 | Release créée en **brouillon** ; publication par un workflow séparé, lancé à la main après le smoke test ; tag avec `-` publié en pre-release | `.github/workflows/build.yml` (`draft-release`), `.github/workflows/publish-release.yml` |
| M2 | `latest.json` construit avec `jq`, URLs reconstruites (`/releases/download/<tag>/<nom>`), échec si un fichier, une URL ou une signature manque ; noms d'assets présents dans le brouillon vérifiés avant et au moment de publier | `build.yml`, `publish-release.yml` |
| M3 | Job `checks` bloquant sur PR, push `main` et tags : `npm ci`, lint, `tsc --noEmit`, `npm test --if-present`, `vite build`, `cargo test --locked` (dépendances Tauri 2 installées, cache cargo) | `build.yml` |
| M4 | Actions épinglées par SHA (version en commentaire) ; secrets de signature visibles **uniquement** par l'étape `Build Tauri` (`env:`), clé supprimée par `trap` ; `contents: read` par défaut ; jobs de build **sans** jeton d'écriture ; `write` seulement pour `draft-release` et `publish` ; `persist-credentials: false` | `build.yml`, `publish-release.yml` |
| M4 | Dependabot : `github-actions` hebdomadaire (SHA et commentaire) ; `npm` mensuel, 2 groupes (`npm-mineures`, `npm-majeures`), au plus 2 PR par mois filtrées par la porte qualité. Les majeures (React 19, Vite 8, jsdom 30, lucide 1.x) sont à planifier hors release (chantier 2.2.0) | `.github/dependabot.yml` |
| M7 (court terme) | Procédure SmartScreen et quarantaine Defender en texte | `docs/RELEASE.md` §3 |
| m1 (CI) | Globs MSI retirés ; collecte stricte : exactement 1 fichier par motif, filtré sur la version | `build.yml` |
| m3 | Plus de réécriture de version en CI : `tauri.conf.json` et `package.json` doivent égaler le tag, tag > release publiée (semver, pre-release comprise) | `scripts/check-release-version.mjs` |
| m4 | `--generate-notes`, notes recopiées dans `latest.json.notes` (affichées par l'app) | `build.yml` |
| m5 | Build seulement sur tag `v*` et `workflow_dispatch` ; `main` et PR ne lancent que `checks` | `build.yml` |
| m6 | Node `>=22.13.0 <23` (garantit `node:sqlite` sans drapeau pour les tests QA) + étape de contrôle dans `checks` | `build.yml` |
| m9 | CSP (sans `unsafe-eval`, aucune origine externe), `nosniff`, `X-Frame-Options`, `frame-ancestors 'none'`, `Referrer-Policy`, `Permissions-Policy`, `X-Robots-Tag: noindex, nofollow`, cache immuable des assets | `vercel.json` |
| Runbook, QA7-04 | Release ; smoke test = 12 parcours de `07-qa.md` §5 + import CSV `03/04/2026` + updater pilote ; rollback depuis `pre-upgrade_*` (repli `auto_*`) | `docs/RELEASE.md` |
| Détection | Sonde horaire des deux endpoints updater (manifeste valide, version = release publiée, assets présents) | `.github/workflows/updater-probe.yml` |

Hors de mon couloir, traités par le Back : B2, M6, m1 (`targets`), m2. Reportés par D11 : M5, M7 (Authenticode).

## Écarts assumés par rapport à la délégation
- **SQL comparé exactement, pas après normalisation des espaces.** sqlx calcule un SHA-384 sur le texte exact
  (sqlx-core 0.8.6 `migration.rs:25`) et renvoie `VersionMismatch` s'il diffère d'une migration appliquée
  (`migrator.rs:175`). Un simple espace ajouté casse donc tout le parc ; le message précise « espaces seulement ».
- **Tag de référence = `releases/latest` de l'API en CI, pas `git describe`.** `git describe` renvoie par
  construction un ancêtre de HEAD (le contrôle d'ascendance devient vide, B1 serait passé) et, sur un build de tag,
  le tag lui-même. En local sans argument : le plus haut tag stable qui ne pointe pas sur HEAD.
- **Publication = workflow `workflow_dispatch` séparé**, plutôt qu'un environnement GitHub à approbation : sûr par
  défaut (aucun réglage du dépôt requis), et le smoke test se fait sur le setup.exe du brouillon.
- **Builds sans `contents: write`** : les installeurs passent par les artefacts du run ; seul `draft-release`
  (sans aucun secret) écrit sur la release. La clé de signature ne coexiste jamais avec un jeton d'écriture.

## Vérifications faites
- `node --test scripts/release-guards.test.mjs` : 8 tests verts (parseur, littéraux bruts, ajout, suppression,
  espaces, doublon, version trop basse, semver pre-release, bump obligatoire).
- `check-migrations.mjs v2.0.2` : OK (HEAD et arbre de travail du Back, 9 migrations). Copie sans migration 9 :
  échec `VersionMissing`. Copie avec un espace ajouté dans la 9 : échec. Copie avec une migration 10 : OK.
  Clone à 3a36368 (ancien `main`) : 2 erreurs, non-ancêtre + migration 9 absente. `lib.rs` non modifié.
- `check-release-version.mjs v2.0.3 v2.0.2` : échec attendu (versions commitées à 0.1.4).
- YAML des 4 fichiers valide (parseur `yaml` du projet, clés uniques) ; chaque bloc `run:` passe `bash -n` ;
  toutes les actions épinglées sur 40 caractères hexadécimaux ; aucune expression `${{ }}` dans un `run:`.
- Construction de `latest.json` simulée avec de faux assets : OK ; `.sig` absent ou vide : échec.
- Sonde updater exécutée localement contre la prod : les deux endpoints servent 2.0.2, assets présents.
- Clone propre de e0eb472 avec `npm ci` : `npm run lint` (0 erreur, 4 avertissements) et `tsc --noEmit` passent.
- **actionlint non exécuté** : absent du poste, téléchargement du binaire refusé par le bac à sable.

## SLO (fenêtre glissante de 30 jours)

| SLI | Mesure | SLO | Budget |
|---|---|---|---|
| Manifeste disponible et cohérent | Sonde horaire `updater-probe.yml` : 2 endpoints, JSON valide, version = release publiée, assets présents | 99,5 % des sondes | ≈ 3 h 36 / mois |
| Release sans casse de base | Releases publiées ayant provoqué une base illisible (`VersionMissing` / `VersionMismatch`) | 0 | Aucun : tout cas = SEV1 + postmortem |
| Mises à jour réussies | Téléchargements du setup.exe de la nouvelle version à J+7 / taille du parc connue, et poste pilote OK | ≥ 90 % à J+7 | Sous 70 % : enquête (réseau, SmartScreen, updater) |
| Délai de restauration poste | Procédure `RELEASE.md` §5 étape 11 chronométrée en VM | RTO ≤ 30 min | - |

RPO poste : depuis le dernier lancement de l'app (copie au démarrage, Back) ; perte du poste non couverte (D11).
Alerte : l'échec d'un workflow planifié notifie le propriétaire par e-mail ; deux échecs consécutifs = appliquer le
runbook. Attention : GitHub désactive les workflows planifiés après 60 jours sans activité sur un dépôt public.

## Renommage Actio (2.1.0-rc.2)

`productName` passe de « Gestion des Inscriptions » à « Actio ». `identifier` ne change pas, donc les données ne bougent pas :
`%APPDATA%\com.badstephane.gestion-inscription\` (base, `backups\`), `%LOCALAPPDATA%\com.badstephane.gestion-inscription\` (logs, WebView2).
Sources : dépôt tauri-apps/tauri, `crates/tauri-bundler/src/bundle/windows/nsis/`, lues avec `gh api`.

**Q1, template de la rc.2.** @tauri-apps/cli 2.12.4 (package-lock), tag `@tauri-apps/cli-v2.12.4` = commit 993038c, crate tauri-bundler du workspace.
- Mode `currentUser` par défaut (`mod.rs:359`). Dossier : `$LOCALAPPDATA\${PRODUCTNAME}` (`installer.nsi:547`), sauf si un dossier est mémorisé sous
  `HKCU\Software\${MANUFACTURER}\${PRODUCTNAME}` (`:69`, `:727`). MANUFACTURER = `badstephane`, 2e segment de l'identifier (`mod.rs:286`).
- Clé de désinstallation : `HKCU\...\Uninstall\${PRODUCTNAME}` (`:67`). Raccourcis : `$SMPROGRAMS\${PRODUCTNAME}.lnk` et `$DESKTOP\${PRODUCTNAME}.lnk` (`:996`, `:1020`).
- Exe : nom du paquet Cargo, `app.exe` (`rust.rs:944`, aucun `mainBinaryName`). Il est identique en 2.0.2 et en 2.1.0.
- Hooks : `bundle.windows.nsis.installerHooks`, inclus en tête du script (`:35-36`). Macros `NSIS_HOOK_PREINSTALL` (`:686`, avant copie, registre et
  raccourcis), `NSIS_HOOK_POSTINSTALL` (`:778`), `NSIS_HOOK_PREUNINSTALL`, `NSIS_HOOK_POSTUNINSTALL`.
- Changement par rapport à 2.11 : l'app ouverte est détectée par son **chemin** `$INSTDIR\app.exe` via Restart Manager (`:690`). L'ancienne app,
  lancée depuis `...\Gestion des Inscriptions\`, n'est donc pas fermée par le template : c'est le hook qui la ferme.
- Conséquence sans hook : nouveau dossier, nouvelle clé, nouveaux raccourcis, donc deux applications installées.

**Q2, désinstalleur de la 2.0.2.** `git show v2.0.2:package-lock.json` donne @tauri-apps/cli 2.11.0, soit le commit e60834f (tauri-bundler 2.9.0).
- Les données ne sont supprimées que si `$DeleteAppDataCheckboxState = 1` **et** `$UpdateMode <> 1` (`installer.nsi:864-865`, puis `RmDir /r` `:876-877`).
- La case n'est lue qu'en quittant la page de confirmation (`un.ConfirmLeave`, `:452-455`), et cette page n'existe pas en mode `/S`.
  `/UPDATE` met `$UpdateMode` à 1 (`:764-767`). Arguments retenus : `/S /UPDATE _?=<ancien dossier>`. Ils donnent deux conditions fausses
  indépendantes, et `_?=` fait attendre la fin du désinstalleur. C'est le même appel que celui du template lors d'une réinstallation (`:350-353`).
- Ce que l'ancien désinstalleur fait dans ce mode : suppression de `app.exe` (`:780`) et de la clé `Uninstall` (`:851`). Il garde ses raccourcis
  (`:817`, `UpdateMode`). Le hook supprime donc lui-même les raccourcis, `uninstall.exe` et le dossier (`RMDir` sans `/r`), comme le fait
  le template 2.12.4 (`:401-409`).

**Q3, updater.** C'est le 2.0.2 installé qui lance la mise à jour : tauri-plugin-updater 2.10.1, mode `Passive` par défaut, avec
`/P /R /UPDATE /ARGS` (`config.rs:41`, `updater.rs:808-815`) via ShellExecute, puis `exit(0)`. Pour les versions suivantes,
2.14.1 passe `/P /UPDATE [/R /ARGS]` (`updater.rs:1058-1077`). En `/UPDATE`, le template ne crée aucun raccourci
(`installer.nsi:982-988`) : le hook recrée « Actio » (menu Démarrer, et Bureau s'il existait) après une migration.

**Hook** `src-tauri/windows/hooks.nsh`. Il ne fait rien sans clé `Uninstall\Gestion des Inscriptions`. Sinon : fermeture de l'ancienne app
(question en mode graphique), désinstalleur `/S /UPDATE`, filet de sécurité sur les fichiers connus, raccourcis seulement s'ils visent l'ancien exe,
clés HKCU, puis recréation des raccourcis. Aucune commande ne vise `$APPDATA` ni `$LOCALAPPDATA\<identifier>`. Smoke : RELEASE.md, parcours 14 à 16.
Limite : MSI 2.0.2 (0 téléchargement) et installation `perMachine` non gérés.

## Risques ouverts

| Risque | Impact | Rôle | Mitigation |
|---|---|---|---|
| M5 : mise à jour Windows de 196 Mo (WebView2 embarqué) | Coût data pour les opérateurs, mises à jour abandonnées | Back + SRE | D11 : setup d'update `webviewInstallMode: skip` à la prochaine release |
| M7 : pas d'Authenticode | SmartScreen et faux positifs Defender à la 1re installation | PM (budget) | Procédure texte ; cible Azure Trusted Signing ou SignPath Foundation |
| Versions commitées à 0.1.4 | Tout tag échoue tant que le bump n'est pas commité (voulu) | Back | Commiter `X.Y.Z` dans tauri.conf, package.json, Cargo.toml avant le tag |
| `cargo test` à froid sur ubuntu | Job `checks` au-delà de 10 min sans cache | SRE | Cache `rust-cache` ; mesurer au 1er run |
| Rollback poste = manipulation de fichiers | Erreur humaine (journal SQLite laissé en place) | SRE + PM | Procédure pas à pas, déplacement plutôt que suppression ; à chronométrer en VM |
| Copie `pre-upgrade_*` absente (échec d'écriture, disque plein) | Rollback sur une copie `auto_*` moins récente | Back | Repli documenté ; présence vérifiée au parcours 2 du smoke test |
| Clé de signature updater unique | Fuite = mise à jour malveillante signée | SRE | Surface réduite (M4) ; rotation documentée (§5 étape 12) |
| macOS non notarisé (m8) | Gatekeeper bloque la 1re ouverture | PM | Plateforme secondaire (H1) |

## Coûts
- GitHub Actions : gratuit (dépôt public, runners Windows et macOS compris). Durée estimée par release :
  `checks` 8 à 12 min, builds 15 à 25 min en parallèle. Sonde horaire : moins de 1 min par exécution.
- Vercel (démo) : offre gratuite suffisante, aucune fonction serveur.
- Authenticode (D11, à décider) : Azure Trusted Signing, de l'ordre de 10 USD par mois ; SignPath Foundation
  gratuit pour l'open source, sous conditions d'éligibilité. Montants à confirmer au moment de la décision.
- Côté opérateurs : 196 Mo de données par poste et par mise à jour Windows tant que M5 n'est pas traité.
