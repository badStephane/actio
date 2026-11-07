# Revue QA avant prod : Actio 0.1.4 (branche audit/pre-prod, commit 3a36368)

## Hypothèses et méthode
- H-QA1 : revue par lecture de code, sans exécuter l'app Tauri. Les comportements JS ont été vérifiés avec `node`
  (xlsx 0.18.5, même version que le projet), le comportement SQLite/ACL en lisant les sources des crates
  installées (`tauri-plugin-sql 2.4.0`, `sqlx 0.8.6`, `tauri-plugin-fs 2.5.1`) dans le registre cargo local.
- H-QA2 : QA-01 et QA-04 sont démontrés par le code et les ACL, pas par une exécution : une confirmation sur un
  build Windows (10 min) est demandée avant correctif, elle ne change pas le verdict.
- H-QA3 : postes en UTC+0 (Sénégal, Côte d'Ivoire, Mali) et UTC+1 (Niger, Bénin, Nigeria, Cameroun).
- H-QA4 : les fichiers d'import réels viennent d'Excel FR (dates au format court, montants « # ##0 »).

## Verdict : NO-GO
Quatre bloquants : la sauvegarde et la restauration ne peuvent pas fonctionner (permissions absentes), l'import
xlsx divise par 1000 les montants formatés et remplace en silence les colonnes non reconnues (mode de paiement,
date, montant), et la transaction d'import n'est pas atomique. Aucun test n'existe pour attraper ces erreurs.

## 1. Constats triés par sévérité

| ID | Constat / bug (fichier:ligne) | Sévérité | Correction ou test à ajouter |
|---|---|---|---|
| QA-01 | Sauvegarde et restauration `.db` impossibles : `copyFile` exige `fs:allow-copy-file`, `db.close()` exige `sql:allow-close`, aucune des deux n'est accordée (`capabilities/default.json:8-27`, `dbBackup.ts:24,39,41`) | Bloquant | Ajouter les 2 permissions. Test CI « garde ACL » : chaque commande de plugin appelée dans `src/` a sa permission. Smoke test release |
| QA-02 | Import : montant au format Excel « # ##0 » lu en texte « 5,000 » puis `replace(',', '.')` donne 5 F ; « 1,500,000 » donne 1,5 F (`importRegistrations.ts:94-95`, `:176` `raw:false`) | Bloquant | Lire les valeurs typées (`raw:true`) ; `parseAmount` strict (entier, retire espaces, espaces insécables, F, FCFA ; refuse les séparateurs ambigus). Total importé affiché dans l'aperçu. 15 tests unitaires |
| QA-03 | Import : une colonne non reconnue devient une valeur par défaut, sans alerte : paiement -> `cash` (`:63`), date -> aujourd'hui (`:69`), montant -> montant par défaut de l'activité (`:129-131`). Notre propre export (« Montant (F CFA) », `excelExport.ts:25`) n'est pas relu (`normalize` garde les parenthèses), ni « Mode paiement », ni l'apostrophe typographique « d’inscription » | Bloquant | Valider les en-têtes au niveau fichier : colonne attendue absente = message et confirmation explicite. Alias + normalisation de `()` et `’`. Test aller-retour export -> import |
| QA-04 | `addRegistrationsBulk` envoie `BEGIN`, chaque `INSERT` et `COMMIT` en appels séparés à un pool sqlx (10 connexions, file FIFO, `wrapper.rs:166`) : rien ne garantit la même connexion. Import partiel, « database is locked », voire connexion laissée en transaction ouverte et écritures perdues (`storage.ts:202-234`) | Bloquant | (Back) un seul `INSERT ... VALUES (...),(...)` par lot de 500 lignes (une instruction = atomique), ou commande Rust transactionnelle. Test d'intégration avec pool de 2 connexions |
| QA-05 | Dates Excel au format court (numFmt 14) rendues « m/d/yy » par SheetJS : 03/04/2026 importé en 2026-03-04 (inversion silencieuse), 15/05/2026 rejeté ; nombre série brut « 46157 » rejeté (`importRegistrations.ts:78-86`, `:176`) | Majeur | `raw:true` sans `cellDates`, convertir le nombre série via `XLSX.SSF.parse_date_code`. Fixtures xlsx réels |
| QA-06 | Double clic sur « Enregistrer » : le bouton n'est désactivé qu'après l'attente de `findDuplicateRegistration`, deux inscriptions créées, totaux gonflés (`RegistrationForm.tsx:175-196,427`) | Majeur | Verrou `isSubmitting` posé dès l'entrée de `handleSubmit`. Test composant (2 submits -> 1 appel) |
| QA-07 | Échec d'enregistrement silencieux : `catch` ne fait que `console.error`, aucun message (`RegistrationForm.tsx:168-170`) | Majeur | Message d'erreur visible et saisie conservée. Test composant avec `addRegistration` en échec |
| QA-08 | Changer de mot de passe ou se récupérer efface le code de récupération : `setPassword` fait `DELETE` puis `INSERT` sans colonnes `recovery_*` (`auth.ts:70-74`). Le code imprimé ne marche plus, la seule issue devient « Tout effacer » | Majeur | `UPDATE` des seules colonnes mot de passe (ou `INSERT ... ON CONFLICT`). Test : set code -> change mdp -> verify code = vrai |
| QA-09 | Liste, activité sélectionnée : le bandeau « Inscriptions / Montant total / Wave / OM / Espèce » affiche les totaux de toutes les activités, archivées comprises (`RegistrationList.tsx:280-294,470-497`) | Majeur | Calculer sur `filteredRegistrations` (ou libeller « toutes activités »). Test unitaire `computeTotals` |
| QA-10 | Restauration (latent, masqué par QA-01) : aucun contrôle du fichier choisi (SQLite valide, schéma, version de migration), aucune copie de sécurité de la base courante, le mot de passe de l'autre base est importé ; si la copie échoue après `close()`, `dbPromise` reste fermé (`dbBackup.ts:28-42`, `db.ts:3-9`) | Majeur | Copie auto `inscriptions.before-restore.db`, validation (`PRAGMA integrity_check`, tables, `_sqlx_migrations` <= version app), réinitialiser `dbPromise`. Devient Bloquant dès QA-01 corrigé |
| QA-11 | Verrou « fail-open » : si `hasPassword()` échoue (base verrouillée, fichier corrompu), l'écran de création s'affiche et `setPassword` écrase le mot de passe existant (`AuthGate.tsx:73-75`, `auth.ts:70`) | Majeur | En erreur : écran d'erreur, jamais `setup`. Test composant |
| QA-12 | « Tout effacer » accessible sans mot de passe depuis l'écran verrouillé, sans sauvegarde préalable ; laisse `audit_events` (noms + montants) et les activités alors que le message promet tout supprimé (`auth.ts:127-131`, `AuthGate.tsx:155-166,334`) | Majeur | Sauvegarde auto avant reset, purge de l'audit, saisie de confirmation. Test d'intégration du reset |
| QA-13 | Aucun test, `tsc` et `lint` hors CI ; un tag publie l'updater sans aucune porte qualité (`build.yml`) | Majeur | Job `quality` bloquant avant `build` (section 3) |
| QA-14 | Doublons incohérents : formulaire en `LIKE %chiffres%` (sous-chaîne, à sens unique), `REPLACE` ne retire pas `.` `(` `)`, `LOWER` SQLite ASCII seul (« BÂ » différent de « Bâ ») ; import en égalité stricte avec accents normalisés ; démo en JS (`storage.ts:65-95`, `importRegistrations.ts:107-108`) | Mineur | Une fonction pure `phoneKey`/`dupKey` partagée, calculée en JS, testée |
| QA-15 | Date par défaut en UTC (`toISOString`) : la veille entre 00:00 et 01:00 en UTC+1, alors que le tableau de bord compare à la date locale (`RegistrationForm.tsx:32`, `importRegistrations.ts:69`, `Home.tsx:32-38`) | Mineur | Helper `todayLocalIso()` unique. Test avec `TZ=Africa/Lagos` |
| QA-16 | Dates impossibles acceptées ou décalées : « 31/02/2026 » stocké tel quel, « 2026-02-30 » devient 2026-03-02, « 29/02/2025 » accepté (`importRegistrations.ts:73-76,84-86`) | Mineur | Validation par reconstruction (`Date.UTC` puis comparaison jour/mois/année) |
| QA-17 | Montants non entiers acceptés : formulaire `step="any"` + `parseFloat`, import « 1 500,50 », « 12abc » -> 12, « 5e3 » -> 5000 (`RegistrationForm.tsx:110,150,364`, `importRegistrations.ts:94-95`) | Mineur | Entier strictement positif, regex stricte |
| QA-18 | Export : date d'inscription écrite en texte selon la locale du poste, non triable dans Excel, inversée au réimport si locale en-US (`excelExport.ts:24`) | Mineur | Écrire une vraie cellule date ou ISO `AAAA-MM-JJ` |
| QA-19 | Recherche sensible aux accents et aux espaces du téléphone : « aissatou » ne trouve pas « Aïssatou », « 771234567 » ne trouve pas « 77 123 45 67 » (`RegistrationList.tsx:157-162`) | Mineur | Normaliser les deux côtés (NFD, chiffres seuls) |
| QA-20 | Code de récupération enregistré avec `trim()`, vérifié brut : un espace final refuse le bon code (`RecoveryCodeModal.tsx:66`, `RecoveryUnlockModal.tsx:62`) | Mineur | `trim()` à la vérification |
| QA-21 | « 30 derniers jours » compte les dates futures (`ActivityStats.tsx:78`) | Mineur | Borne `0 <= écart <= 30 j` |
| QA-22 | Téléphone saisi en nombre dans Excel : le 0 initial est perdu, doublon non détecté (`importRegistrations.ts:117`) | Mineur | Clé téléphone sur les 9 derniers chiffres ; avertir dans l'aperçu |

## 2. Analyse de risques des parcours critiques

| Parcours | Prob. | Impact | Constats | Couverture prévue |
|---|---|---|---|---|
| Import xlsx | Élevée | Argent + données | QA-02/03/04/05/16/22 | Unitaire (corpus de fixtures), intégration SQL, E2E démo |
| Sauvegarde / restauration | Certaine | Données | QA-01/10 | Garde ACL CI, intégration, smoke manuel Windows |
| Totaux et stats par activité / mode | Moyenne | Argent | QA-09/21 | Unitaire sur fonctions de calcul extraites |
| Saisie d'inscription | Moyenne | Données + argent | QA-06/07/14/15/17 | Composant + E2E démo |
| Mot de passe / récupération / reset | Moyenne | Accès + données | QA-08/11/12/20 | Unitaire auth (WebCrypto Node) + intégration |
| Migration d'une base existante (H4) | Faible si figée | Données, tous postes | aucun bug ; risque de modif d'une version 1-8 | Test Rust 1 -> 8 sur base remplie + gel des checksums |
| Export xlsx | Faible | Données | QA-18 | Unitaire (mapping) + aller-retour |
| Mode démo | Faible | Image | aucun bloquant | E2E Playwright = parcours de démo |

## 3. Fiches de bug (bloquants et majeurs)

**QA-01 Sauvegarde / restauration toujours en erreur.** Env : build Windows 0.1.4. Étapes : Inscriptions ->
Sauvegarder -> choisir un chemin. Attendu : fichier `.db` créé. Obtenu (par ACL) : toast « Erreur lors de la
sauvegarde » (commande `plugin:fs|copy_file` refusée). Restaurer : `plugin:sql|close` refusée, même toast.
Indices : `default.json` n'accorde que `fs:allow-read-file`, `fs:allow-write-file`, `sql:allow-load/execute/select`.

**QA-02 Montant divisé par 1000.** Étapes : fichier Excel, colonne Montant au format « Nombre avec séparateur »
(5 000) ; importer. Attendu : 5 000 F. Obtenu : 5 F (vérifié : `"5,000 F"` -> 5, `"1,500,000 F"` -> 1,5).
L'aperçu ne montre que 5 lignes repliées et aucun total : l'erreur passe.

**QA-03 Colonnes remplacées en silence.** Étapes : exporter une activité, réimporter le fichier dans une activité
avec montant par défaut 5 000. Attendu : montants d'origine. Obtenu : 5 000 partout (« Montant (F CFA) » ->
`montant(fcfa)` non reconnu). Variante : en-tête « Mode paiement » -> 100 % Espèce, répartition Wave/OM fausse.

**QA-04 Import non atomique.** Étapes : ouvrir le tableau de bord (`Promise.all` crée 2 connexions), importer
200 lignes. Attendu : tout ou rien. Obtenu possible : `BEGIN` sur la connexion A, inserts alternés A/B,
« database is locked » après 5 s, `ROLLBACK` sur la mauvaise connexion ; lignes partiellement insérées, un
réimport crée des doublons ; A peut rester en transaction et bloquer toute écriture jusqu'au redémarrage.

**QA-05 Jour et mois inversés.** Étapes : cellule date Excel FR « 03/04/2026 » (format date court) ; importer.
Attendu : 2026-04-03. Obtenu : 2026-03-04 (vérifié, SheetJS rend « 4/3/26 »). « 15/05/2026 » : ligne rejetée.

**QA-06 Doublon par double clic.** Étapes : remplir le formulaire, double-cliquer « Enregistrer ». Attendu : 1
inscription. Obtenu : 2 (le second clic passe pendant l'attente de la vérification de doublon).

**QA-07 Échec muet.** Étapes : base verrouillée ou en lecture seule, enregistrer. Attendu : message d'erreur.
Obtenu : le bouton redevient actif, rien d'affiché.

**QA-08 Code de récupération perdu.** Étapes : définir un code, changer le mot de passe, verrouiller, « Mot de
passe oublié ». Attendu : le code fonctionne. Obtenu : option absente ou code refusé (colonnes à NULL).

**QA-09 Totaux faux dans la liste.** Étapes : Inscriptions -> carte d'une activité. Attendu : total de cette
activité. Obtenu : « Montant total » de toutes les activités.

**QA-10 Restauration destructrice (latent).** Étapes (après QA-01) : Restaurer un fichier non SQLite ou d'une
version plus récente. Obtenu attendu par le code : base courante écrasée sans copie, app inutilisable au reload.

**QA-11 Contournement du verrou.** Étapes : base verrouillée par un autre programme au démarrage. Obtenu : écran
« Créer un mot de passe » ; la création écrase l'ancien dès que la base se libère.

**QA-12 Reset incomplet et sans filet.** Étapes : écran verrouillé -> Réinitialiser -> Tout effacer. Obtenu :
inscriptions perdues sans sauvegarde, journal d'audit nominatif conservé.

## 4. Stratégie de test minimale (avant la prochaine release)

**Outillage.** Vitest (natif Vite, `import.meta.env` géré), environnement `node` pour `src/utils` (Node 20 fournit
`crypto.subtle`, `atob`, `btoa`), `jsdom` + Testing Library pour 3 composants. `@vitest/coverage-v8`.
Prérequis Front : extraire en fonctions pures exportées `toIsoDate`, `parseAmount`, `parsePaymentType`,
`normalizeHeader`, `dupKey`, `todayLocalIso`, et `src/utils/stats.ts` (`computeTotals`, `breakdownByPayment`,
`last30Days`) utilisé par `Home`, `ActivityStats`, `RegistrationList`.

**Unitaire (bloquant, ~60 cas).**
- Import (35) : partitions et limites de `parseAmount` (« 5 000 F », « 5,000 », « 1.500 », espace insécable,
  vide, 0, négatif, « 12abc ») ; `toIsoDate` (série Excel, ISO, FR jj/mm/aa, 31/02, 29/02 bissextile ou non) ;
  paiement (wave, OM, « Orange Money », inconnu) ; en-têtes (alias, `()`, `’`, colonne absente) ; doublons
  (intra-fichier, existants, 0 initial perdu).
- Corpus `tests/fixtures/import/` de vrais `.xlsx` : dates format 14, montants « # ##0 », colonnes manquantes,
  export Actio, 2 000 lignes, CSV « ; ». Chaque bug d'import corrigé ajoute son fichier.
- Stats (12) : totaux par activité et par mode, liste vide, activité archivée, montants additionnés sans flottant.
- Auth (6) : set / verify, mauvais mot de passe, changement conserve le code de récupération (QA-08), `trim`.

**Intégration SQL (bloquant, ~15 cas).** `vi.mock('@tauri-apps/plugin-sql')` par un adaptateur `better-sqlite3` en
mémoire (`select`/`execute`, conversion `$1` -> `?`) sur le schéma produit par les vraies migrations. Couvre
`storage`, `activities`, `audit`, `auth`, reset. Pour QA-04 : un adaptateur à 2 connexions sur fichier temporaire
qui alterne les appels, pour prouver l'atomicité de l'import.

**Migrations (bloquant).** Test Rust `cargo test` dans `src-tauri` : extraire `fn migrations()` de `lib.rs`, appliquer
avec le `Migrator` sqlx sur une base v1 remplie (10 inscriptions, wave/cash), puis v5, vérifier : lignes
conservées, `activity_id` par défaut, `email` supprimée, `orange_money` accepté. Plus un test qui gèle le SHA-384
des SQL 1 à 8 (une modification casserait tous les postes installés, H4).

**E2E (bloquant après 2 semaines stables, alerte avant).** Playwright contre `vite build` avec `VITE_DEMO_MODE=true`,
Chromium : (1) saisie -> liste -> tableau de bord à jour ; (2) import du corpus -> aperçu -> totaux ; (3) filtre
activité + export (événement `download`, relecture du fichier). Ne couvre ni SQLite ni les ACL : d'où le smoke test
manuel Windows de 10 min par release (sauvegarde, restauration, verrouillage, import, mise à jour depuis N-1).
`tauri-driver` + WebdriverIO sur `windows-latest` : plus tard, si le smoke manuel coûte trop.

**Garde ACL (bloquant).** Script node : liste des imports `@tauri-apps/plugin-*` utilisés dans `src/` comparée aux
permissions de `capabilities/default.json` (aurait détecté QA-01).

**CI.** Nouveau job `quality` (ubuntu, sur PR et push) dont dépend `build` : `tsc -b`, `eslint`, `vitest run
--coverage` (seuil 80 % sur `src/utils`), garde ACL, `cargo test`. Alerte non bloquante : couverture globale,
`npm audit`, E2E en rodage. Un tag `v*` ne publie `latest.json` que si `quality` est vert.

**Chiffrage.** Setup Vitest + extraction des fonctions 1 j ; unitaires + corpus 1,5 j ; adaptateur SQL et
intégration 1 j ; test Rust migrations + gel checksums 0,5 j ; garde ACL 0,25 j ; Playwright 3 parcours 1 j ;
job CI 0,25 j. Total : 5,5 jours.

## 5. Critères de release (DoD de la prochaine version)
- [ ] QA-01 à QA-04 corrigés, chacun avec son test de régression ; zéro Majeur ouvert sur import, saisie, stats
      et sauvegarde (QA-05 à QA-10) ; QA-11 et QA-12 corrigés ou acceptés par écrit par le PM
- [ ] Job `quality` vert et bloquant ; couverture `src/utils` >= 80 %
- [ ] Test de migration 1 -> 8 (et 9+ si ajoutée) vert sur base remplie ; checksums 1-8 inchangés
- [ ] Smoke manuel Windows signé : sauvegarde puis restauration aller-retour sans perte, import du corpus,
      verrouillage, récupération, mise à jour depuis 0.1.4 avec base remplie conservée
- [ ] Aperçu d'import affichant total, répartition par mode et colonnes non reconnues
- [ ] Rollback documenté (réinstaller N-1 + restaurer la sauvegarde pré-mise à jour), testé une fois avec le SRE
- [ ] Risques résiduels listés et acceptés par le PM

## Annexe : à vérifier hors lecture de code
- `XLSX.writeFile` (export, modèle) dans la WebView Tauri : téléchargement réel sur Windows et macOS, non vérifié.
- Chemins : `plugin-sql` ouvre la base dans `app_config_dir`, `dbBackup` lit `appDataDir` : identiques sous
  Windows et macOS, divergents sous Linux (non distribué).
- Inscriptions héritées de la v1 (`phone=''`, `amount=0`) : non modifiables sans inventer une valeur (validation).
