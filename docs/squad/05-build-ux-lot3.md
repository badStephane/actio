# 05 - Construction Front : UX Lot 3 « identité Actio et finition »

Date : 2026-11-07. Rôle : Développeur Front-End (P5). Branche `ux/lot-1` sur 0c19140, aucun commit.
Spécification : 02-design-ux.md §3 Lot 3 (3.1 à 3.4 ; U24 à U27, U29), plus les ajouts PM a), b) et c).

## Hypothèses
- HL6 : l'écran de verrouillage n'est pas joignable en démo (`DEMO_CONTEXT.lock` ne fait rien) : pas de capture.
- HL7 : la couleur choisie pour une activité n'est pas une couleur de paiement. La palette de création évite seulement le bleu ciel et le vert des modes.

## Réalisé (ID → fichiers)
| ID | Réalisation | Fichiers |
|---|---|---|
| 3.1 U26, U27 | Sidebar `brand-900` ; texte `slate-300` ; entrée active sur fond blanc 10 % avec filet gauche de 3 px et texte blanc semi-gras ; `kbd` Ctrl+N ; version en `slate-400` 12 px ; anneau de focus blanc, décalé sur la marine. Entrées et structure inchangées | `App.tsx`, `index.css`, `tailwind.config.js` (`brand-400`) |
| 3.2 U25 | Conteneur unique `.page` (`max-w-6xl px-6 py-5`) sur les 7 écrans et sur l'en-tête de page ; Liste et Historique passent dans un `.panel`. `.panel` en `rounded-card shadow-card`. Titres de page en `text-xl` | `index.css`, `App.tsx`, `Home.tsx`, `RegistrationList.tsx`, `RegistrationListParts.tsx`, `Audit.tsx`, `Activities.tsx`, `ActivityRow.tsx`, `ActivityStats.tsx`, `ImportReview.tsx`, `RegistrationForm.tsx` |
| 3.3 U24 | `.btn` en 14 px et 36 px minimum (plus aucun bouton de 28 px) ; primaire `brand-600` / `brand-700` ; `.btn-danger` en `danger`. Tous les accents `blue-*` passent sur la gamme `brand-*` (0 restant). Palette d'activité : `#3b82f6` et `#10b981` remplacés (bleu du logo, vert tilleul). Barre de progression de mise à jour en `brand-600` | `index.css`, 15 composants (spinners, icônes, liens), `ActivityFormModal.tsx`, `UpdateChecker.tsx` |
| 3.4 U29 | Badge démo dans le flux, en haut à droite de la zone principale. Il ne recouvre plus la sidebar | `DemoBanner.tsx`, `App.tsx` |
| a) | Libellé de la barre : « Activité en cours » seulement aujourd'hui ou à venir. Sinon « Activité suivie » : le mot décrit ce que fait le tableau de bord, pas l'état de l'événement, donc il ne contredit jamais « Terminée le … ». Activité terminée : pastille neutre gris clair à bordure | `currentActivity.ts` (`activityHeading`), `Home.tsx` |
| b) | « Mode de paiement » dans l'export Excel et dans le modèle téléchargeable. L'import accepte toujours « Type de paiement » | `utils/excelExport.ts`, `utils/importRegistrations.ts` |
| c) | Accueil : deux groupes (identité et statut / actions) qui tiennent sur une ligne à 1366. En cas de repli, le groupe d'actions passe entier à la ligne, aligné à droite. Libellé visible « Changer : » remplacé par un libellé `sr-only` et une infobulle. Liste : deux rangées voulues, chacune sur une ligne, au même bord gauche : (1) liste, compteur, Exporter ; (2) filtres (`role="search"`) | `Home.tsx`, `RegistrationListToolbar.tsx` (nouveau), `RegistrationList.tsx` |

## Critères vérifiés (mesures CDP, Chrome headless, démo)
- Bord gauche à 232 px, à 1366 et 1920, sur les 7 écrans : h1 et premier panneau à **232** partout. Exception apparente : Stats, où la rangée commence à 232 par le bouton retour, puis le h1 à 300. **OK**.
- `grep -rnE 'bg-blue-500|#3b82f6|#10b981|#f97316'` dans `src/pages`, `src/components`, `App.tsx` : **0**. Bonus : `blue-[0-9]` dans `src` : **0** ; `text-[10/11px]` : **0**.
- a) Activité passée : « Activité suivie », pas « Activité en cours » (test d'écran + test de `activityHeading` sur les 4 statuts). **OK**.
- b) Aller-retour export → import avec « Mode de paiement » ; fichier avec l'ancien en-tête « Type de paiement » ; modèle téléchargeable : **3 tests OK**.
- c) Barre de l'Accueil à 1366 : hauteur **70 px** (une ligne : bouton de 44 + padding). Liste : rangées de **48 + 40 px**, chacune sur une ligne. Mesures identiques à 1920.

## Contrastes (formule WCAG 2.x, calculés)
| Paire | Ratio | Seuil |
|---|---|---|
| `slate-300` #CBD5E1 sur marine #192A49 (entrées) | 9,63:1 | 4,5 |
| `slate-300` sur survol (blanc 5 %, #253552) | 8,27:1 | 4,5 |
| Blanc sur entrée active (blanc 10 %, #303F5B) | 10,56:1 | 4,5 |
| `kbd` `slate-300` sur entrée active | 7,12:1 | 4,5 |
| Version `slate-400` #94A3B8 sur marine | 5,58:1 | 4,5 |
| Filet actif `brand-400` #6A9DDA sur fond actif / sur marine | 3,75:1 / 5,07:1 | 3 (non-texte) |
| Anneau de focus blanc sur marine | 14,30:1 | 3 |
| Blanc sur `brand-600` (primaire) / sur `brand-700` (survol) | 5,91:1 / 8,07:1 | 4,5 |
| Blanc sur `danger` #B91C1C | 6,47:1 | 4,5 |
| Badge démo : blanc sur amber-800 | 7,09:1 | 4,5 |
| Badge « Modifiée » : `brand-700` sur `brand-100` | 6,38:1 | 4,5 |
Écart au plan : le filet `brand-500` prévu ne faisait que **2,78:1** sur le fond actif. J'ai ajouté le token `brand-400` (#6A9DDA).

## Vérifications
- `npm test` : **13 fichiers, 230 tests verts** (226 + 4 : 3 sur l'en-tête Excel, 1 sur `activityHeading`). Le test d'écran de l'Accueil vérifie aussi « Activité suivie ».
- `npx tsc -p tsconfig.app.json --noEmit` : 0 erreur. `npm run lint` : 0 erreur, 0 avertissement.
- `VITE_DEMO_MODE=true npx vite build` : OK, 2207 modules, JS 1 267 Ko (389 Ko gzip), CSS 42 Ko. Composants sous 400 lignes (maximum : `RegistrationForm.tsx`, 387). Serveur 5176 arrêté.

## Captures
`captures locales non versionnées (screens/)` : `lot3_{avant,apres}_{accueil,saisie,liste,activites,stats,historique,controle-imports}_{1366,1920}.png` (28 fichiers), en mouvement réduit pour que les graphiques soient rendus. Liste : `?activity=demo-act-plage`.

## Écarts
1. Écran de verrouillage : pas de capture (HL6). Il reprend les boutons et la gamme `brand`, mais pas la marine.
2. En démo, la page Stats affiche une ligne d'en-tête qui ne porte que le badge (cette page a son propre titre) : 36 px perdus, en démo seulement.
3. Sidebar : « Nouvelle inscription » et `Ctrl+N` tiennent sur deux lignes dans 208 px. La largeur est conservée pour garder le bord à 232.
4. À 1920, la moitié droite reste vide, par choix (`max-w-6xl` sur toutes les pages, plan §2).
5. Couleurs vertes de succès (`emerald`) conservées : ce sont des états, pas des modes de paiement.
