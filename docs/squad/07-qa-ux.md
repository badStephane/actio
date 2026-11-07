# 07 - Validation QA du chantier UX (lots 1 à 3)

Date : 2026-11-07. Rôle : Ingénieur QA (P7). Branche `ux/lot-1`, commits 9bd28a5, 0c19140, 31d4734 au-dessus de 60516d5.
Méthode : diff `60516d5..HEAD` lu AVANT les rapports 05-build-ux ; chaque statut est prouvé par `fichier:ligne`, par un
test exécuté ici ou par une mesure sur capture. Aucune modification du code de production.
## Hypothèses
- HQ1 : pas de Windows ni de WebView2 ici. Ctrl+N, focus visible, presse-papiers, zoom et lecteur d'écran : §6. Mesure
  de l'import sur `node:sqlite` (Mac, sans IPC) ; durée Windows estimée.
- HQ2 : jsdom ne gère pas Tab : l'ordre de tabulation est calculé comme le navigateur (ordre du document, un arrêt par
  groupe radio). Aucun `tabIndex` positif dans `src/` (grep = 0), donc le calcul est fidèle.

## Verdict : GO sous conditions pour fusionner le chantier UX
Aucune régression des correctifs de l'audit. Les critères des 3 lots sont tenus ou renvoyés au smoke Windows. Un Majeur
préexistant (QA-UX-01, double clic dans la confirmation de doublon) n'est pas introduit par l'UX mais touche la caisse.
Conditions :
1. **C1 (Front), avant `git tag v2.1.0`** : corriger QA-UX-01, puis `it.fails` -> `it` dans `RegistrationForm.qa-ux.test.tsx`.
2. **C2 (QA + utilisateur)** : smoke UX du §6 (12 parcours) vert, en plus des 13 parcours de `RELEASE.md` §3.
3. **C3 (tous)** : commiter `src/components/RegistrationForm.qa-ux.test.tsx` et `src/utils/importAddressFill.sql.test.ts`.
4. **C4 (PM)** : accepter par écrit QA-UX-03 (import lent sur gros fichier) ou le faire corriger (1 requête au lieu de N).
## 1. Non-régression des correctifs de l'audit (07-qa.md)
| Correctif | Tient ? | Preuve |
|---|---|---|
| QA-06 anti double soumission | Oui | Verrou `useRef` posé avant toute attente `RegistrationForm.tsx:236,246`, relâché seulement sur succès `:207`, échec `:229`, annulation `:273`. Tests : `RegistrationForm.test.tsx` (2 submits) ; qa-ux « Entrée deux fois dans le groupe Paiement pendant un enregistrement lent » (2 Entrée + clic + Entrée = 1 appel, puis l'inscription suivante passe). Trou préexistant : QA-UX-01 |
| Réinitialisation sans redirection | Oui | `resetFormAfterSave` `registrationFormModel.ts:64` : identité vidée, activité et date gardées, montant habituel, Espèces (D21) ; erreurs et note contact effacées `RegistrationForm.tsx:195-199`. Tests lot1 + qa-ux (3 saisies enchaînées) |
| Focus après enregistrement | Oui | `focusSoon('lastName')` (rAF) `:199` ; test qa-ux : focus sur Nom en moins de 300 ms, 3 fois de suite |
| QA-07 état d'erreur d'enregistrement | Oui | `role="alert"` `:346`, saisie conservée, panneau de session non alimenté (sessionStorage `[]`), verrou relâché : test qa-ux |
| M3 Front, erreurs de chargement | Oui | `LoadError` toujours présent (Audit 5/5, Stats 5/5 occurrences avant/après) ; saisie : alerte + Réessayer `ActivityBar.tsx:76-83` ; `Activities` : Supprimer masqué tant que les compteurs manquent `ActivityRow.tsx:43` |
| M4 Front, ErrorBoundary | Oui | `main.tsx:9` racine, `App.tsx:70` `resetKey={location.pathname}` inchangés |
| M5 Front, verrou `inert` (D4) | Oui | `AuthGate.tsx:115,226` inchangés (diff = couleur du spinner). Ctrl+N/F2 ignorés si `[inert]` ou `aria-modal` (`shortcuts.ts:21`), défaut navigateur annulé quand même : test qa-ux |
| QA-11, AuthGate en échec fermé | Oui | diff `AuthGate.tsx` = 1 ligne de classe |
| Contrôle des imports | Oui | `ImportReview.tsx`, `ImportReviewRow.tsx` : diff limité aux classes (`text-xs`, `.page`, `brand-600`) |
| QA-03 / QA-04 import strict et atomique | Oui | `analyzeHeaders` et confirmation des colonnes manquantes inchangés ; adresse facultative (D19) `importRegistrations.ts:160` ; reprise du carnet faite AVANT l'écriture, `addRegistrationsBulk` (`storage.ts:202`, hors diff) = 1 instruction `json_each`. Test `importAddressFill.sql.test.ts` sur le vrai schéma : ligne invalide = 0 ligne, adresses reprises écrites |
| Reprise d'adresse : pas d'écrasement | Oui | seules les lignes à `address === ''` sont complétées `importRegistrations.ts:328` ; même personne + 9 derniers chiffres (D9). Tests vraie base : adresse du fichier gardée, autre prénom ignoré, `+221` reconnu |
| Reprise d'adresse : performance | **Non conforme (Mineur)** | 1 requête par personne sans adresse, chacune balaie le carnet (`LIKE '%…%'` sur `REPLACE`) : QA-UX-03 |
| En-tête Excel, aller-retour | Oui | export `excelExport.ts:45` « Mode de paiement » / « Espèces » ; alias `modedepaiement`, `especes` ; ancien « Type de paiement » / « Espèce » toujours lus. Tests : aller-retour export -> import, deux en-têtes, modèle |
| Sauvegarde et restauration en Préférences (D20) | Oui | `BackupActions` n'est plus importé que par `BackupsSection.tsx:54` (grep) ; confirmation de restauration inchangée (`BackupActions.tsx` hors diff) ; Échap ne ferme plus les Préférences sous une confirmation `PreferencesModal.tsx:36-37` |
| QA7-05 emplacement des sauvegardes | Oui (lecture) | `%APPDATA%\com.badstephane.gestion-inscription\backups` `BackupsSection.tsx:14-15` = `app_config_dir()` `backup.rs:56` + `tauri.conf.json:5`. Copier le chemin : smoke U10 |
| QA-09 totaux sous filtre | Oui | `RegistrationStatsStrip rows={filteredRegistrations}` |
## 2. Critères d'acceptation (02-design-ux.md §3)
| Critère | Statut | Preuve |
|---|---|---|
| 1.1 Accueil sur Sortie Plage -> sidebar -> formulaire sur Sortie Plage, 2 500 F | Vérifié | test lot1 « reprend l'activité mémorisée » ; `Home.tsx:59` écrit la même clé |
| 1.1 Idem après redémarrage | À l'exécution | `localStorage` : smoke U2 |
| 1.2 3 inscriptions sans souris ni attente, focus Nom < 300 ms | Vérifié | qa-ux « 3 contacts nouveaux enchaînés » |
| 1.2 Bandeau annoncé par un lecteur d'écran | Vérifié (statique) | zone `role="status"` toujours présente `RegistrationFormParts.tsx:133` ; NVDA : smoke U11 |
| 1.2 Modification depuis le panneau revient à la Saisie | Vérifié | test lot1 `/edit/r1?retour=saisie` |
| 1.3 Après 6 saisies, total = somme des lignes | Vérifié | `computeSessionTotals` (lot1Models) ; total calculé sur toutes les saisies, pas sur les 5 affichées |
| 1.3 Nom de 40 caractères tronqué avec `title` | Vérifié (lecture) | `SessionPanel.tsx:62` `truncate` + `title`, grille `minmax(0,1fr)` |
| 1.4 Contact nouveau en 5 Tab + 1/2/3 + Entrée (≤ 7) | Vérifié | rejoué : **6 gestes** (4 Tab, une touche, Entrée depuis Paiement), adresse vide (D19) |
| 1.4 Ordre Nom -> Prénoms -> Téléphone -> Adresse -> Paiement (1 arrêt) -> Montant | Vérifié | qa-ux. Écart : 3 arrêts (« Changer la date », « Effacer », « Voir la liste ») entre Montant et Enregistrer ; sans effet, Entrée valide |
| 1.4 La molette ne change jamais le montant | Vérifié (lecture) | `type="text" inputMode="numeric"` `RegistrationFormParts.tsx:41` |
| 1.4 Sans défilement à 1366×700 et 900×600 | Vérifié 1366 (capture lot 3, bas du formulaire à 517 px) ; 900×600 vérifié sur capture lot 2 seulement | refaire 900×600 après lot 3 : smoke U8 |
| 1.5 Contact connu en ≤ 4 gestes hors frappe | Vérifié | qa-ux : **2 gestes** (Entrée sur la suggestion, Entrée) ; défaut visuel QA-UX-02 |
| 1.6 « Créer quand même » primaire, focus sur Annuler, message complet | Vérifié | `ConfirmModal` variante `default` ; test lot1Models (message) ; trou QA-UX-01 |
| 2.1 Activité passée : « Terminée », jamais « en cours » avec une durée passée | Vérifié | lot2Screens ; capture `lot3_apres_accueil_1366` (« Activité suivie » + « Terminée le 3 août 2026 ») |
| 2.1 0 inscription aujourd'hui : message + lien | Vérifié | lot2Screens |
| 2.2 Retour de modification : même liste, filtre, page | Vérifié | lot2Screens « même liste, même filtre, même page » |
| 2.2 Aucune action de remplacement de base dans la Liste | Vérifié | grep `BackupActions`, `restoreDatabase` |
| 2.3 « Exporter » trouvé sans survol | Vérifié (lecture) | bouton texte `ActivityRow.tsx:84` |
| 2.3 axe DevTools : 0 erreur de contraste (Activités) | À l'exécution | contrastes calculés OK (§3) ; smoke U12 |
| 2.4 2 500 F affiché 2 500, jamais « 3k » | Vérifié | `formatAxisAmount` (lot2Models) branché sur l'axe et l'infobulle `StatsCharts.tsx:74-75` |
| 2.5 grep `text-\[1[01]px\]` = 0 | Vérifié | 0 résultat |
| 2.5 Zoom 200 % sans perte d'information à 1366 | À l'exécution | smoke U9 |
| 3 Bord gauche du contenu à 232 px, 1366 et 1920, 7 écrans | Vérifié | mesure pixel sur les 14 captures `lot3_apres_*` : 232 px partout |
| 3 grep `bg-blue-500\|#3b82f6\|#10b981\|#f97316` = 0 | Vérifié | 0 résultat |
## 3. Accessibilité (vérifiable sans navigateur)
Contrastes WCAG 2.x calculés depuis `tailwind.config.js` (script : luminance relative ; fonds translucides composés) :
- Texte, tous ≥ 4,5:1 : ink-muted sur blanc 7,55 / surface-subtle 7,23 / surface-app 6,86 / brand-50 6,82 ; blanc sur
  cash 5,48, wave 5,93, om 5,17, brand-600 5,90, amber-800 (badge démo) 7,09 ; badges -ink sur -soft 6,37 à 6,77 ;
  warning 6,83, success 7,29, danger 5,91 sur leurs fonds ; sidebar slate-300 9,63, version slate-400 5,57, actif 10,56.
- Non-texte, tous ≥ 3:1 : bordure des champs gray-500 4,83 ; anneau brand-600 5,90, blanc sur marine 14,29 ; filet actif
  brand-400 3,74 (brand-500 aurait fait 2,78 : écart du lot 3 justifié) ; remplissages cash 3,76, wave 4,09, om 3,55.
- **KO** (hors écrans principaux, QA-UX-05) : gray-400 = 2,53:1 pour des icônes seules et un texte (`ActivityFormModal.tsx:132`,
  `ChangePasswordModal.tsx:104`, `ContactBookSection.tsx:167,275`).
- ARIA : segment de paiement = `fieldset` + `legend` + 3 vrais `radio` (nom « Espèces » / « Wave » / « Orange Money »,
  chiffre `aria-hidden`, aide `aria-describedby`) ; bascule = 2 boutons `aria-pressed` dans `role="group" aria-label="Période"` ;
  raccourcis annoncés (`aria-keyshortcuts="Control+N F2"` sur l'entrée de menu, `"Enter"` sur Enregistrer) ; combobox
  `aria-activedescendant` et ids uniques par champ ; noms « Statistiques de X », « Exporter les inscriptions de X en Excel »
  commencent par le libellé visible (WCAG 2.5.3).
- Cibles : paiement et champs 44 px, `.btn` 36, `.btn-icon` 36, `.btn-sm` et bascule 32, liens ≥ 24 px. Pas de couleur seule :
  mode = icône + libellé, mode choisi = coche, « Événement passé » et « Terminée » = icône + texte.
- À faire à la main : axe DevTools sur les 7 écrans, zoom 200 %, focus visible après un choix de contact à la souris
  (focus posé par script : `:focus-visible` peut ne pas s'afficher), NVDA (bandeau, segment, combobox) : §6.

## 4. Bugs (fiches)
**QA-UX-01 Doublon : double clic sur « Créer quand même » = 2 inscriptions (Majeur, Front, préexistant).**
Env : `ux/lot-1` 31d4734, jsdom. Étapes : saisir une personne déjà inscrite, Entrée, double-cliquer « Créer quand même ».
Attendu : 1 inscription. Obtenu : 2 (`addRegistration` appelé 2 fois), toujours. Cause : `ConfirmModal` reste affichée
150 ms après fermeture (animation), boutons actifs, et `handleConfirmDuplicate` (`RegistrationForm.tsx:266`) n'a pas de
verrou. Même code en 60516d5 : non introduit par l'UX. Correctif : verrou `ref` dans `handleConfirmDuplicate`, ou ignorer
`onConfirm` quand `open` est faux. Test : `it.fails('doublon : double clic sur « Créer quand même »…')`.

**QA-UX-02 Après choix d'un contact, la liste du champ Prénoms s'ouvre et reste ouverte (Mineur, Front, préexistant).**
Choisir « Sow Ibrahima » depuis Nom : le prénom rempli relance la recherche du champ Prénoms (préfixe du prénom), la liste
s'affiche sous Prénoms, par-dessus Adresse, alors que le focus est sur Paiement ; `aria-expanded="true"` sur un champ sans
focus. Plus visible depuis le Lot 1 (focus sauté). Le clavier n'est pas gêné ; un clic sur Adresse retombe sur la liste.
Correctif : ne chercher que sur une frappe de l'utilisateur, ou n'ouvrir que si le champ a le focus. Test `it.fails`.

**QA-UX-03 Reprise d'adresse à l'import : N requêtes balayant tout le carnet (Mineur, Front).**
Mesure (`node:sqlite`, Mac, sans IPC) : 5 000 lignes sans adresse × carnet de 5 000 contacts = 5 000 requêtes, **11,7 s** ;
coût ∝ lignes × contacts. Estimation sur portable Windows d'entrée de gamme avec IPC : 25 à 60 s de « Analyse en cours… »
sans progression. Aucun risque de données (lecture seule, avant l'écriture). Correctif : 1 requête qui charge les contacts
avec adresse dans une `Map` par `personKey` (comme `getAllContactDedupKeys`). Garde : `importAddressFill.sql.test.ts`
compte les requêtes (N) ; à passer à 1 avec le correctif.

**QA-UX-04 Aide de l'import : « Adresse : requis » contredit D19 (Cosmétique, Front).** `ImportRegistrationsModal.tsx:155`.

**QA-UX-05 Icônes et texte gray-400 à 2,53:1 dans les modales (Mineur, Front).** Voir §3 ; `text-ink-muted` suffit.

## 5. Sorties des commandes (2026-11-07, macOS, Node 24)
| Commande | Résultat |
|---|---|
| `npm test` | 15 fichiers, **243 tests verts** (dont 2 `it.fails` = QA-UX-01, QA-UX-02) ; avant ajout QA : 13 fichiers, 230 |
| Couverture v8, nouveaux modules | 96,2 % lignes, 91,7 % branches : homeStats, paymentMeta, shortcuts 100 % ; registrationFormModel 100 % ; sessionEntries 98,5 % ; currentActivity 93,2 % ; entryTiming 88,5 % ; registrationListModel 86,4 % ; uiFormat 77,8 % |
| `npx tsc -p tsconfig.app.json --noEmit` | 0 erreur (tests QA compris) |
| `npm run lint` | 0 erreur, 0 avertissement |
| `VITE_DEMO_MODE=true npx vite build` | OK, 1 267 Ko (389 Ko gzip), avertissement de taille de chunk connu ; 0 script inline, 0 `eval` |
| `cargo test --locked` (src-tauri) | 5 tests unitaires + 1 d'intégration verts |
| `node --test scripts/release-guards.test.mjs` | 9 tests verts |
| `node scripts/check-migrations.mjs v2.0.2 --head-file src-tauri/src/lib.rs` | OK, 9 migrations publiées intactes, 12 en tête (aucune migration UX) |

## 6. Smoke test UX Windows (complète `RELEASE.md` §3, même setup.exe, poste 1366×768)
| # | Parcours | Critère de réussite |
|---|---|---|
| U1 | Ctrl+N depuis l'Accueil, la Liste, un champ texte ; puis F2 | La Saisie s'ouvre, focus sur Nom, **aucune nouvelle fenêtre** WebView2. Déjà sur la Saisie avec un nom tapé : focus sur Nom, rien d'effacé. Écran verrouillé ou modale ouverte : rien ne se passe |
| U2 | Accueil réglé sur une activité, fermer l'app, relancer, ouvrir la Saisie | Même activité et même montant habituel |
| U3 | 3 inscriptions sans souris : Nom, Tab, Prénoms, Tab, Téléphone, Tab, Tab, touche 2, Entrée | 6 gestes chacune ; bandeau « Inscription enregistrée … Wave » ; Espèces remis ; focus sur Nom sans attente |
| U4 | Dans le segment Paiement : flèches, touches 1/2/3, Entrée ; touche 2 dans Montant | Flèches et chiffres changent le mode ; Entrée enregistre une fois ; dans Montant, « 2 » s'écrit dans le champ |
| U5 | Ordre de tabulation complet de la Saisie, puis Maj+Tab | (menu) -> Activité -> (Modifier du bandeau) -> Nom -> Prénoms -> Téléphone -> Adresse -> Paiement -> Montant -> Changer la date -> Effacer -> Voir la liste -> Enregistrer ; anneau de 2 px visible à chaque arrêt, y compris sur le segment |
| U6 | Contact connu : 2 lettres, Entrée ; puis le même choix à la souris | Coordonnées reprises, ligne « Coordonnées reprises du carnet », focus sur Paiement **visible** dans les deux cas |
| U7 | 6 saisies, fermer l'app (croix), relancer | Panneau : total = somme ; après relance : panneau vide (session vidée). Verrouiller puis déverrouiller : panneau conservé |
| U8 | Fenêtre 900×600 puis 1366×700, formulaire avec bandeau affiché | Formulaire complet visible sans défilement ; panneau dessous à 900 |
| U9 | Zoom 200 % (Ctrl + molette) sur la Saisie, la Liste, l'Accueil | Aucune information coupée ni superposée ; tout reste atteignable au défilement |
| U10 | Préférences > Sauvegardes : « Copier le chemin », Windows+R, coller ; restaurer puis Échap | Le dossier `backups` s'ouvre ; Échap ferme la confirmation seule, pas les Préférences |
| U11 | NVDA : enregistrer une inscription ; parcourir le segment ; ouvrir une suggestion | Annonces « Inscription enregistrée… », « Mode de paiement, Espèces, bouton radio, coché, 1 sur 3 », option active lue |
| U12 | axe DevTools (WebView2, `F12` en build de dev ou Edge sur le build démo) sur Accueil, Saisie, Liste, Activités, Stats, Historique, Contrôle des imports ; plus l'écran de verrouillage | 0 erreur « color-contrast », 0 « critical » ; verrouillage aux couleurs Actio (icône brand-600 sur brand-50), compte à rebours lisible |
| U13 | Après installation : barre des tâches, menu Démarrer, Ajout/Suppression de programmes, icône de la fenêtre ; sidebar, verrouillage et pastilles de paiement (logos Wave, Orange Money, Espèces) | Icône Actio (A blanc + coche verte sur marine) nette à 16, 32 et 48 px ; logos visibles hors ligne, libellé texte à côté de chaque logo de paiement |
Un seul KO = NO-GO (règle `RELEASE.md`).

## 7. Risques résiduels (à accepter par le PM)
| Risque | Impact | Mitigation | Accepté par (PM) |
|---|---|---|---|
| QA-UX-03 import lent sur gros fichier sans adresses | Opérateur qui croit l'app bloquée | Correctif 1 requête, ou consigne « patienter » | |
| QA-UX-02, -04, -05 | Gêne visuelle, contraste dans 3 modales | Prochaine release | |
| Ctrl+N intercepté par WebView2 (HL1 du lot 1) | Raccourci inopérant, F2 reste | Smoke U1 ; sinon libellé `kbd` à passer à F2 | |

## Annexe : constats sans fiche, une ligne chacun
- Date gardée après enregistrement (spécifié) : un guichet ouvert après minuit date de la veille ; l'avertissement « différente d'aujourd'hui » apparaît au rendu suivant.
- Frappe pendant un enregistrement en cours (< 100 ms en local) effacée par la remise à zéro : risque faible.
- `useSessionEntries` relit chaque saisie à l'arrivée (jusqu'à 500 `getRegistrationById`) : sans effet aux volumes du guichet.
- Confirmation de restauration : texte toujours « dossier de l'application / backups » (`BackupActions.tsx:25`) alors que le vrai chemin est affiché juste au-dessus.
