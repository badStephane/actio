# 05 - Construction Front : UX Lot 2 « clarté et lisibilité »

Date : 2026-11-07. Rôle : Développeur Front-End (P5). Branche `ux/lot-1` sur 9bd28a5, aucun commit.
Spécification : 02-design-ux.md §3 Lot 2 (2.1 à 2.5, U11 à U22), plus les ajouts PM a), b) et c).

## Hypothèses
- HL4 : la Liste se souvient de son état pour la session (sessionStorage), comme le panneau de saisie. Elle repart de l'écran de choix au prochain lancement.
- HL5 : à l'import, l'adresse est cherchée dans le carnet avec `searchContacts` (chiffres du téléphone), puis comparée avec la même clé `personKey` que la détection de doublons. Les recherches partent par paquets de 25.

## Réalisé (ID → fichiers)
| ID | Réalisation | Fichiers |
|---|---|---|
| 2.1 U11 | Statut toujours vrai : « Dans N jours », « Aujourd'hui » ou badge « Terminée le 3 août 2026 ». « Il y a N jours » et « Temps restant » disparaissent. `pickCurrentActivity` choisit la prochaine activité, sinon la plus récemment passée, sinon la dernière créée | `currentActivity.ts`, `HomeSections.tsx`, `Home.tsx` |
| 2.1 U12, U13 | « Moyenne par inscription », légendes « Aucune aujourd'hui » et « Aucune ce mois-ci », plus de code couleur. « Nouvelle inscription » passe en `btn-lg` dans la barre d'activité, avec « Statistiques » et « Voir la liste ». Carte des modes : bascule « Aujourd'hui / Toute l'activité » (`aria-pressed`, Aujourd'hui par défaut) | `HomeSections.tsx`, `homeStats.ts`, `Home.tsx` |
| 2.2 U14 | Liste, filtres, tri et page mémorisés (sessionStorage). L'écran de choix n'apparaît qu'au premier passage ou via « Changer de liste ». Après « Mettre à jour », retour sur `/registrations`, qui rouvre la même liste au même endroit | `registrationListModel.ts`, `RegistrationList.tsx`, `RegistrationForm.tsx` |
| 2.2 U15 | Recherche `w-72` avec un libellé `sr-only` et « Nom, prénom ou téléphone » ; filtres ; « Exporter Excel » à droite. Tableau en `text-sm`, actions de 36 px (`.btn-icon`), dates sans objet `Date`. D20 vérifié : ni Sauvegarder ni Restaurer dans la Liste (test) | `RegistrationList.tsx`, `RegistrationTable.tsx`, `RegistrationListParts.tsx` |
| 2.3 U16, U17, U28 | « Statistiques » et « Exporter » en boutons texte `btn-sm`. Importer, Modifier, Archiver, Supprimer en icônes de 36 px avec `aria-label` et infobulle. Archivée : badge et texte `ink-muted`, plus d'`opacity`. Chargement en skeleton de 4 lignes | `ActivityRow.tsx`, `Activities.tsx`, `index.css` (`.btn-sm`, `.btn-icon`) |
| 2.4 U18, U19, c) | Axe des montants exact (« 2 500 », jamais « 3k »), groupage fait sans `Intl` car Chrome affichait « 1500 ». Axe des inscriptions en entiers. Légendes en `ink-soft` avec pastille. Remplissages issus de `paymentMeta`. Animations coupées si mouvement réduit. « Exporter Excel » dans l'en-tête. Tableaux `sr-only` des valeurs (m22) | `uiFormat.ts`, `StatsCharts.tsx`, `ActivityStats.tsx` |
| 2.5 U20, U21, U22 | 0 `text-[10px]` ou `text-[11px]` dans `src`. Plus de majuscules espacées. « Mode de paiement » dans l'UI. Historique : « Entité » devient « Concerne », « Effacer l'historique » passe en `btn-danger-ghost`, séparé et poussé à droite. Version de la sidebar en 12 px gray-400 (6,9:1) | 11 fichiers (`ImportReviewRow`, `LockScreen`, `ContactBookSection`...), `Audit.tsx`, `App.tsx`, `ImportPreview.tsx`, `ImportRegistrationsModal.tsx` |
| a) 900×600 | Variante `short:` (hauteur < 700 px) : espacements compacts ; l'aide sous Nom passe en `sr-only`, donc reste lue sans être affichée. 1366×768 inchangé | `tailwind.config.js`, `RegistrationForm.tsx`, `RegistrationFormParts.tsx`, `ActivityBar.tsx`, `IdentityFields.tsx`, `App.tsx` |
| b) D19 | `fillAddressesFromContacts` : adresse vide (lignes valides et doublons) reprise du carnet si même personne et même téléphone. Une adresse présente n'est jamais remplacée. Si le carnet est illisible, l'import reste possible et l'aperçu le signale. Colonne « Adresse » avec la mention « adresse reprise du carnet », plus un total | `utils/importRegistrations.ts`, `ImportRegistrationsModal.tsx`, `ImportPreview.tsx` |
| Annexe | Dates sans objet `Date` (`formatDateLong` / `formatDateShort`) dans Accueil, Liste, Activités, Stats | `uiFormat.ts` |

## Critères d'acceptation
- 2.1 Activité passée : « Terminée » apparaît, jamais « en cours » avec une durée passée. **OK** (test `lot2Screens`, capture accueil).
- 2.1 Aucune inscription aujourd'hui : « Aucune inscription aujourd'hui » et lien « Nouvelle inscription » vers `?activity=`. **OK** (test).
- 2.2 Modifier depuis la liste filtrée sur Wave ramène à la même liste, au même filtre et à la même page. **OK** (test : liste, Wave, page 2, démontage puis retour sur `/registrations`).
- 2.2 Aucune action de remplacement de la base depuis la Liste. **OK** (test).
- 2.3 « Exporter » trouvable sans survol. **OK** (bouton texte). 0 erreur de contraste axe : **non mesuré** (axe absent, pas de dépendance ajoutée) ; contrastes calculés sur les tokens §2.
- 2.4 Pour 2 500 F, l'axe et l'infobulle affichent « 2 500 ». **OK** (test du formateur ; capture en mouvement réduit).
- 2.5 `grep -rn 'text-\[1[01]px\]' src` : **0**. Zoom à 200 % : **non vérifié**.
- a) 900×600, mesuré en CDP : bas d'Enregistrer à 524/600 à vide, 566/600 avec le bandeau. 1366×768 : 621 (sous 700). **OK**.
- b) Reprise d'adresse et mention dans l'aperçu. **OK** (4 tests, dont la clé personne/téléphone et le carnet en échec).

## Vérifications
- `npm test` : **13 fichiers, 226 tests verts** (204 existants + 22 nouveaux : `lot2Models` 13, `lot2Screens` 5, import 4).
- `npx tsc -p tsconfig.app.json --noEmit` : 0 erreur. `npm run lint` : 0 erreur, 0 avertissement.
- `VITE_DEMO_MODE=true npx vite build` : OK, 2206 modules, JS 1 266 Ko (389 Ko gzip), CSS 41 Ko. Avertissement de taille de chunk déjà présent.
- Composants : tous sous 400 lignes. `RegistrationForm.tsx` passe à 387 lignes avec l'extraction de `FormActions`. Serveur 5176 arrêté.

## Captures
Dossier `captures locales non versionnées (screens/)` :
- avant (9bd28a5) : `lot2_avant_{accueil,liste,activites,stats,historique}.png`, `lot2_avant_saisie_900x600.png` ;
- après : mêmes noms en `lot2_apres_*`, plus `lot2_apres_liste_activite.png` et `lot2_apres_saisie_900x600_enregistree.png`.
- `lot2_apres_stats.png` est prise en mouvement réduit (`--force-prefers-reduced-motion`). En capture normale, recharts est saisi en pleine animation (HD4), comme dans la capture « avant ».

## Écarts au plan
1. Les en-têtes « Type de paiement » de l'export Excel et du modèle d'import restent tels quels : `excelExport.ts` n'est pas autorisé dans ce lot, et le modèle doit rester cohérent avec l'export. L'import reconnaît les deux.
2. Barre d'outils de la Liste et barre d'activité de l'Accueil sur deux lignes à 1366 : aucune information retirée, la largeur unique `max-w-6xl` relève du Lot 3.
3. Historique : la barre reste collée aux bords (conteneur `px-6` commun = Lot 3, 3.2, non anticipé).
4. `.btn-sm` et `.btn-icon` sont ajoutés, car 2.3 les demande. `.btn` garde sa taille globale (Lot 3).
5. Contrastes vérifiés par calcul sur les tokens et à la lecture des captures, pas avec axe DevTools. Zoom à 200 % non testé.
