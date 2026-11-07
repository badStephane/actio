# 05 - Construction Front : marque, logos et correctifs QA-UX

Date : 2026-11-07. Rôle : Développeur Front-End (P5). Branche `ux/lot-1` sur 31d4734, aucun commit. Décisions D23 à D25.

## A. Correctifs QA (D23)
| ID | Correctif | Fichiers |
|---|---|---|
| QA-UX-01 | Une seule confirmation de doublon : il faut la fenêtre ouverte (`isDuplicateOpenRef`) ET le verrou `submittingRef` (posé par handleSubmit, tenu pendant toute la phase du doublon). Le 2e clic pendant l'animation est ignoré | `RegistrationForm.tsx` |
| QA-UX-02 | La recherche n'a lieu et la liste ne s'ouvre que si le champ a le focus. Une valeur posée par le choix d'un contact ne rouvre plus Prénoms ni Téléphone | `ContactAutocomplete.tsx` |
| QA-UX-03 | `getAllContactsForMatching()` ajoutée (une requête, mode démo compris ; signatures existantes inchangées). `indexContactAddresses` indexe par `personKey` ; recherche en mémoire. Aucune lecture s'il n'y a pas d'adresse vide. Mesure : **1 requête, 6 ms** pour 500 lignes × 5 000 contacts (avant : 1 requête par ligne, 11,7 s à 5 000) | `utils/contacts.ts`, `utils/importRegistrations.ts` |
| QA-UX-04 | Aide de l'import : « Adresse : facultative (reprise du carnet de contacts si la personne y figure) » | `ImportRegistrationsModal.tsx` |
| QA-UX-05 | gray-400 remplacé par `ink-muted` (7,5:1) : boutons Fermer (mot de passe, activité, passés en `.btn-icon` de 36 px), suppression de source et numéro de ligne du carnet | `ChangePasswordModal.tsx`, `ActivityFormModal.tsx`, `ContactBookSection.tsx` |
Tests QA : les 2 `it.fails` passent en `it`, assertions inchangées. Une seule assertion modifiée, comme la fiche QA-UX-03 le prévoyait (« à passer à 1 avec le correctif ») : `importAddressFill.sql.test.ts`, `selects` passe de N à 1. Mes tests de reprise du Lot 2 sont réécrits pour le chargeur unique.

## B. Marque Actio (D24)
- Copiés dans le dépôt : `src/assets/brand/actio-logo.svg` et `actio-logo-dark.svg` (les seuls importés ; les SVG ne contiennent ni script ni lien) ; `public/` : favicon.svg (remplacé), favicon.ico, apple-touch-icon.png, icon-192/512, maskable-512, og-image.png, site.webmanifest. `public/logo-mark.svg` est supprimé (plus aucune référence).
- Sidebar : `actio-logo-dark.svg`, `h-7` (28 px), `alt="Actio"`. Barre mobile : `actio-logo.svg`.
- Écrans clairs : logo couleur sur le verrouillage et la création du mot de passe (`LockScreen`), et sur l'écran d'erreur de base (`AuthErrorScreen`). Leur fond passe en marine `brand-900`. La récupération s'ouvre par-dessus le verrouillage, qui montre déjà le logo : pas de second logo.
- `index.html` : favicon SVG + ICO, apple-touch-icon, manifeste, `theme-color`, `og:title`, `og:description` (« Gestion des inscriptions, simple et suivie »), `og:image` /og-image.png 1200×630, `twitter:card` summary_large_image. Manifeste ajouté : il passe les deux CSP (`default-src 'self'`, Vercel et Tauri).
- Icônes Tauri : favicon rendu en PNG 1024×1024 RGBA par Chrome headless (coin à (0,0,0,0) vérifié), puis `npx tauri icon`. Les fichiers générés en plus (android/, ios/, 64x64.png) sont supprimés. `bundle.icon` pointe vers 5 fichiers présents. `tauri.conf.json` inchangé (diff vide). Empreintes md5 icon.ico d6355f74… → bae5bc33…, icon.icns dc5a81b3… → 3dc5735d….

## C. Logos de paiement (D25)
- `src/assets/payment/` : wave.png, orange-money.png, especes.svg recoloré de #7DA7C4 à #047857 (`cash`, la teinte des textes et du bouton choisi). `docs/squad/assets-paiement/` supprimé.
- `paymentMeta.ts` : `icon` (lucide) remplacé par `logo` + `logoClass` (Wave en `rounded-sm`). Nouveau composant `PaymentLogo` : `<img alt="">` décoratif, libellé texte toujours affiché à côté. Utilisé dans les pastilles, le segment de paiement, le bandeau de la Liste, l'Accueil, les légendes des stats et le panneau de session (via les pastilles).
- Segment de paiement : logo sur une tuile blanche de 20 px (lisible sur le fond plein du mode choisi), coche conservée comme indicateur hors couleur. Espacements resserrés pour que Montant reste sur la même ligne.
- Contraste des pastilles inchangé (encre sur fond doux, 6,4 à 6,8:1) : le logo n'ajoute que du décor.

## Vérifications
- `npm test` : **16 fichiers, 247 tests verts**, 0 `it.fails` (243 de QA + `brand.test.tsx` 3 + reprise d'adresse +1).
- `npx tsc -p tsconfig.app.json --noEmit` : 0 erreur. `npm run lint` : 0 erreur, 0 avertissement.
- `VITE_DEMO_MODE=true npx vite build` : OK, 2213 modules, JS 1 272 Ko (393 Ko gzip).
- Dans `dist/` : favicon.svg, favicon.ico, apple-touch-icon.png, icon-192/512, maskable-512, og-image.png, site.webmanifest ; `assets/actio-logo-*.svg`, `assets/actio-logo-dark-*.svg`, `assets/wave-*.png`. especes.svg (1 Ko) et orange-money.png (3 Ko) sont intégrés en `data:` dans le JS (seuil Vite de 4 Ko ; `img-src data:` autorisé par les deux CSP), vérifié par grep.
- `git status src-tauri` : 16 icônes modifiées, dont icon.ico et icon.icns ; rien d'autre.

## Captures (1366×768)
`captures locales non versionnées (screens/)` : `brand_accueil_sidebar.png`, `brand_saisie_paiement.png`, `brand_liste_pastilles.png`, `brand_stats_legendes.png`, `brand_verrouillage.png`, `brand_creation_mot_de_passe.png`, `brand_erreur_base.png`. Les trois dernières viennent d'une page de prévisualisation temporaire, supprimée juste après (rendu hors mode démo). La bande blanche en bas de ces trois captures vient de cette page, pas de l'app. Serveur 5176 arrêté.

## Écarts
1. `og:image` est relative : certains services d'aperçu exigent une URL absolue, et le domaine Vercel n'est pas connu dans le dépôt.
2. Le symbole seul (`actio-mark*.svg`) et `actio-logo-white.svg` ne sont pas copiés dans `src/assets`, car rien ne les utilise.
