# Release, smoke test et rollback d'Actio

Chaîne : tag `v*` → `CI et release` (porte qualité, garde-fous migrations et version, build signé) → release **brouillon** avec `latest.json` validé → smoke test Windows → `Publier une release`. Le parc ne voit rien avant la publication. Jamais le vendredi soir.

## 1. Préparer et taguer
1. PR « bump » : même version `X.Y.Z` dans `src-tauri/tauri.conf.json`, `package.json`, `src-tauri/Cargo.toml`. CI verte, merge dans `main`.
2. `git switch main && git pull && node scripts/check-migrations.mjs` : doit afficher `OK`. Aucune migration publiée ne se modifie, même d'un espace.
3. `git tag vX.Y.Z && git push origin vX.Y.Z`. Candidat : `vX.Y.Z-rc.N`, publié en pre-release, ignoré par l'updater.
4. Échec CI : rien n'est publié. Corriger, supprimer le brouillon éventuel (onglet Releases), taguer `vX.Y.(Z+1)`.

## 2. Vérifier le brouillon
5. Onglet Releases, brouillon `vX.Y.Z` : 6 fichiers (`_x64-setup.exe` + `.sig`, `.dmg`, `.app.tar.gz` + `.sig`, `latest.json`), notes générées lisibles.
6. `gh release download vX.Y.Z -p latest.json -O - | jq '.version, (.platforms | keys)'` : la version et 3 plateformes.

## 3. Smoke test Windows (setup.exe du brouillon ; parcours de `docs/squad/07-qa.md` §5)
Matériel : une VM Windows 10/11 vierge, un poste 2.0.2 avec une **copie anonymisée** d'une vraie base (avec un ancien import xlsx). Noter avant : nombre d'inscriptions, total d'une activité, nombre de contacts.
Première installation (pas d'Authenticode, D11) : « Windows a protégé votre ordinateur » → cliquer **Informations complémentaires** → bouton **Exécuter quand même**. Si Defender met le fichier en quarantaine : Sécurité Windows > Protection contre les virus > Historique de protection > Autoriser.

| # | Parcours | Critère de réussite |
|---|---|---|
| 1 | Installation propre | Création du mot de passe (refus sous 8 caractères), code de récupération affiché une fois |
| 2 | Mise à jour du poste 2.0.2 rempli (setup.exe par-dessus) | Mêmes nombres et totaux ; dans `backups\` : `auto_*_vX.Y.Z.db` ET `pre-upgrade_v<ancienne>_to_vX.Y.Z_*.db` (`vprecedente` depuis 2.0.2) ; dans DB Browser, la copie `pre-upgrade` a `MAX(version)` de `_sqlx_migrations` = celui de l'ancienne version (9 depuis 2.0.2) |
| 3 | Contrôle des imports (bandeau accueil) | Lignes de l'ancien import listées avec raison et suggestion ; « C'est correct » les retire ; « Appliquer » corrige et journalise |
| 4 | Sauvegarde manuelle sur clé USB | Fichier `.db` écrit, événement « Sauvegarde exportée » dans l'Historique |
| 5 | Ajouter une inscription, restaurer la sauvegarde du 4 | Avertissement « tout sera remplacé, mot de passe compris » ; redémarrage seul ; inscription disparue ; `avant-restauration_*.db` présent ; événement « restaurée » |
| 6 | Restaurer un `.txt` renommé `.db`, puis la base d'une autre app | Message d'erreur clair, base en service intacte, pas de redémarrage |
| 7 | Verrouiller pendant une saisie, 5 mauvais mots de passe, puis le bon | Compte à rebours de 30 s, saisie bloquée ; ensuite ouverture, formulaire toujours rempli |
| 8 | « Mot de passe oublié » avec le code | Code accepté une fois, nouveau mot de passe imposé, nouveau code affiché ; l'ancien code est refusé |
| 9 | Import xlsx : modèle de l'app + fichier avec montants `# ##0` et dates au format court | Montants exacts (5 000, pas 5), dates exactes, total dans l'aperçu ; colonne manquante = confirmation exigée |
| 10 | Import CSV avec la date `03/04/2026` | Inscription datée du **3 avril 2026** (pas du 4 mars) |
| 11 | Export Excel (sous CSP stricte) | Fichier téléchargé, ouvert dans Excel, dates ISO, réimportable sans erreur |
| 12 | « Tout effacer » depuis l'écran verrouillé | Exige `EFFACER` ; `avant-reinitialisation_*.db` créé ; redémarrage sur l'écran de création ; Historique = 1 événement `reset` |
| 13 | Après publication (§4, étape 8), poste pilote 2.0.2 mis à jour par l'updater | Mise à jour proposée et installée, base ouverte, `%LOCALAPPDATA%\com.badstephane.gestion-inscription\logs\actio.log` présent |

Un seul KO = NO-GO : ne pas publier (ou, pour le 13, appliquer le §5), ouvrir un ticket, nouveau tag après correctif.

## 4. Publier
7. `gh workflow run publish-release.yml -f tag=vX.Y.Z` (ou Actions > Publier une release). Le job revalide le brouillon, publie (`--latest`, ou pre-release si `-`) et vérifie que les deux endpoints updater servent `X.Y.Z`.
8. Poste pilote : parcours 13 du §3 (mise à jour par l'updater). Puis prévenir les opérateurs.

## 5. Rollback
L'updater ne rétrograde jamais, et une base migrée ne s'ouvre plus avec une version antérieure (sqlx refuse une migration inconnue).
9. **Avant que les postes se mettent à jour** : `gh release edit vX.Y.Z --draft=true`, puis `gh release edit vPRECEDENTE --latest`. Contrôle : `curl -sL https://github.com/badStephane/actio/releases/latest/download/latest.json | jq .version` affiche la précédente.
10. **Postes déjà mis à jour, app utilisable** : ne pas rétrograder. Publier `vX.Y.(Z+1)` corrigé en conservant **toutes** les migrations livrées.
11. **Poste inutilisable** (après l'étape 9, sinon l'updater repropose la version fautive) :
    1. Fermer Actio (vérifier dans le Gestionnaire des tâches qu'il ne tourne plus).
    2. Ouvrir `%APPDATA%\com.badstephane.gestion-inscription\` dans l'Explorateur.
    3. Créer un dossier `avant-rollback` et y **déplacer** `inscriptions.db` et tout `inscriptions.db-journal`, `-wal`, `-shm` (un journal resté en place corromprait la base restaurée).
    4. Dans `backups\`, prendre en priorité `pre-upgrade_v<précédente>_to_vX.Y.Z_*.db` (`pre-upgrade_vprecedente_to_v2.1.0_*.db` pour le passage depuis 2.0.2) : copie hors rotation faite juste avant les migrations de X.Y.Z, au schéma précédent avec toutes les données. Repli seulement si elle manque : le plus ancien `auto_*_vX.Y.Z.db`, sinon le plus récent `auto_*_v<précédente>.db` (perte de la dernière session).
    5. Installer le setup.exe de la version précédente (page de sa release) par-dessus.
    6. Copier la sauvegarde choisie dans `%APPDATA%\com.badstephane.gestion-inscription\` et la renommer `inscriptions.db`.
    7. Lancer Actio, comparer le nombre d'inscriptions avec la dernière liste connue. Logs : `%LOCALAPPDATA%\com.badstephane.gestion-inscription\logs\actio.log`.
12. **Clé de signature exposée** : nouvelle paire, release signée avec l'ancienne clé portant la nouvelle `pubkey`, puis rotation des secrets.
