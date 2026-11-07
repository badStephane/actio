# Audit avant prod d'Actio : rapport consolidé

Date : 2026-11-07. Branche : `audit/pre-prod` (fusion `main` + `v2.0.2`, puis correctifs non commités).
Détail par rôle : `revue-{backend,frontend,sre,qa}.md` ; construction : `05-build-{back,front}.md`, `06-ops.md` ;
validation : `07-qa.md` ; arbitrages : `decisions.md` (D1-D18), `risques.md` (R1-R9).

## 1. Verdict

**Avant l'audit : pas prêt.** `main` ne contenait pas la version en service (une release aurait rendu illisibles
toutes les bases en 2.0.2), sauvegarde et restauration n'avaient jamais fonctionné, et l'import xlsx divisait
des montants par 1000 sans erreur.

**Après correctifs : GO sous conditions pour la 2.1.0.** Tous les Bloquants et Majeurs du périmètre sont corrigés et
couverts par des tests (169 Vitest, 6 cargo, 9 garde-fous de release). Condition restante : smoke test Windows
(13 parcours, `docs/RELEASE.md` §3) exécuté et signé sur une copie anonymisée d'une base 2.0.2 (R9).

## 2. Hypothèses

H1 Windows principal, macOS secondaire · H2 un opérateur par poste, menace = accès physique ou fichier piégé ·
H3 montants XOF entiers, Wave / Orange Money déclaratifs · H4 parc en service, `identifier` intouchable ·
H5 `productName` inchangé, renommage « Actio » limité au titre de fenêtre (D3).
Confirmé par l'utilisateur : des imports xlsx ont déjà eu lieu en prod (R2 → avenant A1, D14).

## 3. Constats (Bloquants et Majeurs), triés par sévérité

| Constat | Rôle | Sévérité | Correction | Statut |
|---|---|---|---|---|
| `main` sans la ligne 2.0.x en service (migration 9) : base illisible sur tout le parc à la prochaine release | SRE | Bloquant | Fusion de `v2.0.2` (D5) + garde-fou CI `check-migrations` (SQL publié comparé au caractère près, D12, D16) | Corrigé |
| Sauvegarde / restauration impossibles (permissions absentes) ; restauration sans validation ni copie | Back | Bloquant | Commandes Rust : `VACUUM INTO`, validation + mise à niveau en transit, sauvegarde préalable, rename atomique, redémarrage | Corrigé, à valider sur Windows |
| Aucune sauvegarde automatique ; migration fautive = perte totale | SRE / Back | Bloquant | 10 copies tournantes au démarrage avant migrations + copie `pre-upgrade_*` hors rotation | Corrigé |
| Import xlsx : « 5,000 » lu 5 F, dates jour/mois inversées, colonnes manquantes remplacées en silence | Back / QA | Bloquant | Lecture brute, `parseAmountXof`, dates strictes, en-têtes validés, aperçu avec total ; CSV en texte UTF-8 / 1252 (D17) | Corrigé |
| Imports déjà faits en prod potentiellement faux | PM | Bloquant | Migration 11 préserve la preuve (`amount_review`) ; écran « Contrôle des imports » (A1) | Corrigé ; revue opérateur à faire poste par poste |
| « Tout effacer » sans mot de passe ni sauvegarde, audit nominatif laissé | Back / Front | Bloquant | Sauvegarde préalable, saisie `EFFACER`, purge complète, événement `reset` (D7) | Corrigé |
| Import non atomique (BEGIN/COMMIT sur pool de 10 connexions) | Back / QA | Majeur | Une instruction `INSERT … SELECT FROM json_each` | Corrigé |
| Verrou en échec ouvert ; `setPassword` efface le code de récupération ; pas de limite d'essais | Back / Front | Majeur | Phase `error`, `createInitialPassword` / `updatePassword`, backoff persistant, code généré à usage unique (D2) | Corrigé |
| Base en clair, verrou présenté comme une protection | Back | Majeur | Texte honnête + recommandation BitLocker (D6) ; SQLCipher hors périmètre | Accepté |
| CSP nulle, fs sur `$HOME/**`, xlsx 0.18.5 (2 CVE) | Back | Majeur | CSP stricte, plugin fs retiré, xlsx 0.20.3 | Corrigé, CSP à valider sous WebView2 (R3) |
| Montants en REAL, pas de clé étrangère, audit incomplet et effaçable | Back | Majeur | Migrations 10-12 : INTEGER ≥ 0, FK RESTRICT, 7 événements système, trigger anti-UPDATE | Corrigé |
| Double soumission, échecs silencieux, erreurs affichées comme états vides, écran blanc, saisie perdue au verrouillage | Front | Majeur | Verrou de soumission, états d'erreur + Réessayer, ErrorBoundary, verrou `inert` (D4) | Corrigé |
| Release « Latest » avant `latest.json`, manifeste non validé, aucune porte qualité, actions non épinglées, clé de signature exposée | SRE | Majeur | Brouillon + manifeste validé + publication manuelle, job `checks` bloquant, SHA, secrets confinés | Corrigé |
| Pas de logs en prod | SRE | Majeur | Log fichier rotatif niveau warn | Corrigé |
| Mises à jour Windows de 196 Mo ; pas d'Authenticode | SRE | Majeur | Hors périmètre (D11), procédure SmartScreen documentée | Accepté provisoirement |

Les Mineurs (une trentaine) sont dans les revues par rôle ; les moins coûteux ont été corrigés au passage.

## 4. Les trois corrections au meilleur rapport impact / effort

1. **Réintégrer v2.0.2 + garde-fou de migrations en CI** : quelques minutes de fusion, évite de casser 100 % du parc.
2. **Sauvegarde automatique avant migration** : une fonction Rust, rend toute erreur future réversible.
3. **Lecture brute de l'import (montants et dates)** : quelques fonctions pures testées, supprime une source d'erreurs financières silencieuses.

## 5. Avant de taguer v2.1.0

- [ ] Commit des correctifs, PR vers `main`, CI verte (`checks`).
- [ ] Build Windows de la branche (`workflow_dispatch`) puis smoke test 13 parcours, signé (R9).
- [ ] Sur chaque poste après mise à jour : ouvrir « Contrôle des imports » et traiter les lignes signalées (R2).
- [ ] Tag `v2.1.0`, brouillon vérifié, publication via `publish-release.yml`.
