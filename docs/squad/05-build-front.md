# 05 - Construction Front : correctifs de l'audit avant prod

Date : 2026-11-07. Rôle : Développeur Front-End. Branche `audit/pre-prod`, aucun commit.
Périmètre : `src/components/**`, `src/pages/**`, `src/App.tsx`, `src/main.tsx`, `src/index.css`.

## Hypothèses
- HF1 : `restoreDatabase` et `resetAppData` redémarrent l'app (contrat 03). Le Front recharge quand même la webview
  par sécurité (3 s après une restauration réussie, tout de suite après un effacement).
- HF2 : après « Appliquer la suggestion » (contrôle des imports), le Front appelle aussi `markReviewed` : sinon une
  date corrigée reste « ambiguë » (jour et mois toujours ≤ 12) et la ligne reviendrait sans fin.
- HF3 : `index.html` contient déjà « Actio · Gestion des inscriptions » : on n'y touche pas (D3 respectée).
- HF4 : M9 (totaux qui suivent les filtres) est déjà corrigé par v2.0.2 ; vérifié, pas refait. La carte
  « Toutes les inscriptions » de l'écran de choix affiche maintenant les totaux globaux.

## Corrigé (constat → fichiers)
| ID | Correction | Fichiers |
|---|---|---|
| M1 / QA-07 | Échec d'enregistrement visible (`role="alert"`, détail technique entre parenthèses), saisie conservée | `RegistrationForm.tsx` |
| M2 / QA-06 | Verrou `useRef` + `isSubmitting` posé avant toute attente ; libéré si erreur ou si on annule le doublon | `RegistrationForm.tsx` |
| M10 / D1 | `parseAmountXof` + `MAX_AMOUNT_XOF`, 0 accepté, `step="1"`, `inputMode="numeric"` ; validation pure | `registrationFormModel.ts`, `RegistrationFormParts.tsx` |
| D10 / QA-15 / m9 | `todayLocalIso()` (date par défaut, accueil, noms d'export) ; `isValidIsoDate` à la validation | Form, `Home.tsx`, `Activities.tsx`, `RegistrationList.tsx` |
| m1 | `aria-invalid` / `aria-describedby` sur chaque champ ; `fieldset` / `legend` pour le paiement | `RegistrationFormParts.tsx`, Form |
| m10, m11, m12, m16 | Minuteurs nettoyés ; `/add?activity=<id>` depuis l'accueil ; activité archivée marquée « (archivée) » en édition ; accents | Form, `Home.tsx` |
| M3 | `LoadError` + « Réessayer » sur Accueil, Liste, Activités, Stats (erreur ≠ introuvable), Historique, Formulaire ; Supprimer masqué tant que `countRegistrationsByActivity` n'a pas répondu ; message de `deleteActivity` affiché | `LoadError.tsx`, les 6 écrans |
| M4 | `ErrorBoundary` racine (`main.tsx`) + un autour des Routes, réinitialisé au changement de chemin ; FR + « Recharger » | `ErrorBoundary.tsx`, `main.tsx`, `App.tsx` |
| M8 / QA-11 | Phase `error` dédiée (jamais `setup`) : « Impossible d'ouvrir la base » + Réessayer + Restaurer une sauvegarde | `AuthGate.tsx`, `AuthErrorScreen.tsx` |
| M5 / D4 | Verrou = écran opaque `z-60` par-dessus l'app, qui reste montée et devient `inert` + `aria-hidden` | `AuthGate.tsx`, `LockScreen.tsx` |
| D2 / D6 | `createInitialPassword` ; `verifyPassword` → attente (`retryAfterMs`, compte à rebours, saisie désactivée), essais restants ; texte honnête (écran, pas fichier ; BitLocker / FileVault) | `LockScreen.tsx`, `useRetryCountdown.ts`, `PreferencesModal.tsx` |
| M7 / QA-12 / D7 | « Tout effacer » → `resetAppData`, saisie de `EFFACER`, message sur la sauvegarde automatique et son emplacement | `AuthGate.tsx`, `ConfirmModal.tsx` |
| m5 | Œil afficher/masquer accessible au clavier (`aria-pressed`), `role="alert"`, refocus après erreur ou attente | `LockScreen.tsx` |
| D2 récupération | Code → `verifyRecoveryCode` (attente) → nouveau mot de passe obligatoire (impossible de fermer) → nouveau code affiché une seule fois (copier + « Je l'ai noté »), repli « Continuer sans code » ; lien « Code perdu ? » vers l'effacement | `RecoveryUnlockModal.tsx`, `RecoveryCodeDisplay.tsx` |
| D2 / m20 | Code généré (plus de code choisi), affiché une fois ; suppression avec confirmation ; erreur de lecture ≠ « pas de code » | `RecoveryCodeModal.tsx` |
| M6 / QA-08 | `updatePassword` ; succès : « Votre code de récupération reste valable » ; `MIN_PASSWORD_LENGTH` vient de `auth.ts` | `ChangePasswordModal.tsx`, `AuthGate.tsx` |
| B1 (UI) / QA-10 | `exportDatabase` / `restoreDatabase` ; la confirmation dit que TOUT est remplacé, mot de passe compris, qu'une sauvegarde auto est faite (emplacement) et que l'app redémarre ; erreurs affichées | `BackupActions.tsx` (Liste + écran d'erreur) |
| B1 / SRE m11 | Préférences : « Sauvegardes automatiques » (`listAutoBackups`, lecture seule, `BACKUP_DIR_LABEL`) ; « Rechercher une mise à jour » (en cours / à jour / disponible / hors ligne non bloquant) | `AutoBackupsSection.tsx`, `UpdateCheckSection.tsx`, `UpdateChecker.tsx`, `updateContext.ts` |
| QA-03 | Aperçu d'import : `missingColumns` en avertissement + case de confirmation obligatoire, « Montant lu », `totalAmount`, `unrecognizedHeaders`, `errors` par ligne ; message « aucune inscription importée » (import atomique) | `ImportPreview.tsx`, `ImportRegistrationsModal.tsx` |
| Audit / m21 | Libellés FR des 7 nouveaux événements + entité `system`, filtres associés ; repli sur le code brut si type inconnu ; « (500 derniers événements) » | `Audit.tsx` |
| D3 / m15 / SRE m7 | `document.title` forcé supprimé | `main.tsx` |
| m3 | `ConfirmModal` : `busy`, `busyLabel`, `confirmText`, focus rendu au déclencheur, `message` accepte du JSX | `ConfirmModal.tsx` |
| m4, m6, m7, m8, m14, m17, m18, m19 | Libellés accessibles (recherche, filtre, lignes / page) ; Toast erreur `role="alert"` 6 s, minuteur stable (`useToast`) ; contrastes amber-700 / emerald-700 ; `<Link to="/add">` ; filtrage en `useMemo` + `useDeferredValue` ; un seul `h1` ; mise à jour : « enregistrez votre saisie », `aria-live`, barre de progression ; export Excel en try/catch | Liste, `Toast.tsx`, `index.css`, `DemoBanner.tsx`, `App.tsx`, `UpdateChecker.tsx`, `Activities.tsx` |

## Avenant A1 : contrôle des imports déjà faits en prod
- Page `/imports/review` « Contrôle des imports » (`pages/ImportReview.tsx`, `ImportReviewRow.tsx`, `importReviewModel.ts`).
  Accès : Préférences (« Ouvrir le contrôle des imports ») et bandeau discret sur l'accueil (`ImportReviewBanner.tsx`,
  visible seulement s'il y a au moins une ligne ; masqué en cas d'erreur, la page affiche l'erreur elle-même).
- Tableau : inscription (nom, activité, taille du lot), raison en clair (« Montant probablement divisé par 1000 »,
  « Montant non entier », « Date jour/mois possiblement inversée »), valeur actuelle (+ montant lu à l'import si
  connu), valeur suggérée. Dates formatées sans objet `Date` (pas de décalage de fuseau).
- Par ligne : « Appliquer la suggestion » (`updateRegistration` puis `markReviewed`, HF2) et « C'est correct »
  (`markReviewed`). Erreur affichée sur la ligne, qui reste dans la liste.
- Correction groupée « Appliquer toutes les suggestions » seulement après une confirmation qui donne le nombre de
  lignes et le total avant / après ; les échecs restent signalés ligne par ligne.
- Cinq états : chargement (skeleton), vide (« Aucune inscription à vérifier »), erreur + Réessayer, partiel
  (« N vérifiées, M restantes, K en erreur »), nominal.

## Décisions
- FD1 : `useAuth` et le contexte vont dans `authContext.ts` (supprime les 2 avertissements react-refresh) ; la
  vérification de mise à jour passe par un contexte (`UpdateChecker` devient le fournisseur).
- FD2 : modales du verrou (effacement, récupération) dans un contexte d'empilement `z-[65]`, au-dessus de l'écran opaque.
- FD3 : pas de réglages ou d'actions dangereuses dans l'écran de base illisible, sauf « Restaurer une sauvegarde »
  (équivalent à l'effacement déjà permis sans mot de passe par D7, et seule sortie sans manipuler APPDATA).
- FD4 : découpage pour rester sous 400 lignes : RegistrationList 826 → 310 (+ `RegistrationTable`,
  `RegistrationListParts`, `BackupActions`) ; Preferences 437 → 120 (+ `ContactBookSection`) ; Home 533 → 357
  (+ `HomeSections`) ; Form 500 → 383 (+ `RegistrationFormParts`, `registrationFormModel`).
- FD5 : `errorMessage(err, repli)` affiche le message de la couche données (FR selon le contrat), sinon le repli.

## Vérifications
- `npx tsc -p tsconfig.app.json --noEmit` : **0 erreur**.
- `npm run lint` : **0 erreur, 0 avertissement** (une erreur temporaire dans `src/utils/amount.ts` côté Back a disparu au dernier passage).
- `VITE_DEMO_MODE=true npx vite build` (sortie dans un dossier temporaire) : **OK**, bundle 1,24 Mo (380 Ko gzip),
  avertissement de taille de chunk déjà présent (recharts + xlsx).
- Dépendances au contrat non satisfaites : **aucune** ; toutes les signatures de 03 et de l'Avenant A1 existent dans `src/utils`.
- Non vérifié : aucun test manuel dans Tauri ni dans un navigateur (pas d'outil d'automatisation installé) ; voir ci-dessous.

## Reste ouvert
- À tester à la main dans Tauri (QA) : verrouiller pendant une saisie puis déverrouiller (saisie conservée, focus) ;
  attente après 5 échecs ; parcours de récupération complet ; restauration et effacement (redémarrage réel) ;
  contrôle des imports sur une base 2.0.2 avec montants / dates abîmés.
- `inert` : les écouteurs `keydown` globaux des modales ouvertes sous le verrou réagissent encore à Échap (ferme
  la modale sous-jacente, sans perte de données). Acceptable, à noter pour QA.
- m2 (piège de focus des autres modales), m13 (téléphone E.164), m22 (alternative texte des graphiques) : non traités.
- m20 : pas de ressaisie du mot de passe avant suppression du code (confirmation seulement) ; à trancher avec la Sécurité.
- `gray-400` restant sur quelques icônes décoratives et textes secondaires des fichiers non touchés.
- Code mort côté Back : `countRegistrationsForActivity` n'est plus appelé par le Front.
