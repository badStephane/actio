# 05 - Construction : dernières versions de la pile front (2.2.0)

Date : 2026-11-07. Rôle : Développeur Front-End (P5). Branche `chore/deps-2.2.0`, partie de `main` 6051528 (66c9dfb + Dependabot #4).
Captures : `docs/squad/deps-2.2.0/` (`<écran>_<largeur>_avant|apres.png`).

## Hypothèses
- HF1 : « dernière version » = tag npm `latest` au 2026-11-07, sauf contrainte de compatibilité écrite ci-dessous.
- HF2 : react-router reste en 7 (demande 6 vers 7) alors que la 8.5.1 est sortie (exige Node >= 22.22, React >= 19.2.7).
- HF3 : WebView2 est evergreen sur les postes Windows (>= Chromium 111). Non vérifié sur le parc.

## Paquets

| Paquet | Avant | Après | Changements de code |
|---|---|---|---|
| vitest, @vitest/coverage-v8 | 3.2.7 | 5.1.0 | aucun |
| jsdom | 26.1.0 | 31.0.0 | espace sorti du `sr-only` des liens « Modifier » (jsdom ne la comptait plus dans le nom accessible ; rendu identique) |
| typescript | 5.6.3 | **6.0.3** | `Uint8Array<ArrayBuffer>` pour le sel PBKDF2 (`auth.ts`), `lib` ES2022 (Error.cause), `types: ["node"]` dans tsconfig.node |
| typescript-eslint | 8.72.1 | 8.72.1 | déjà la dernière ; n'accepte que TS < 6.1, d'où TS 6 et pas 7.0.2 |
| eslint, @eslint/js | 9.12.0 | 10.14.0 / 10.0.1 | `preserve-caught-error` : `{ cause }` sur 4 erreurs relancées (messages inchangés) ; `no-useless-assignment` dans `App.tsx` |
| eslint-plugin-react-hooks | 5.1.0-rc | 7.1.1 | `set-state-in-effect` : 20 effets exemptés ligne par ligne avec motif (voir Risques) |
| globals ; eslint-plugin-react-refresh | 15.11.0 ; 0.5.7 | 17.14.0 ; 0.5.7 (dernière) | aucun |
| vite | 6.3.5 | 8.3.6 | `minify: 'esbuild'` remplacé par la valeur par défaut (Oxc) ; cibles `chrome111` / `safari16.4` |
| @vitejs/plugin-react | 4.4.1 | 6.2.1 | aucun |
| @types/node | absent | 22.20.5 | ajouté (Node 22 de la CI) : `tsc -p tsconfig.node.json` repasse au vert (il échouait avant) |
| lucide-react | 0.344.0 | 1.70.0 | 12 icônes n'existaient plus qu'en alias, renommées : AlertCircle > CircleExclamationPoint, AlertTriangle > TriangleExclamationPoint, ArchiveRestore > ArchiveArrowUp, ArrowDownCircle > CircleArrowDown, BarChart3 > ChartColumn, CheckCircle > CircleCheckBig, CheckCircle2 > CircleCheck, History > RotateCcwClock, Home > House, PlusCircle > CirclePlus, Trash2 > Trash, Wand2 > WandSparkles. Passé avant React (0.344 bloque React 19) |
| react, react-dom ; @types/react, @types/react-dom | 18.3.1 ; 18.3.11 / 18.3.0 | 19.3.1 ; 19.3.0 | aucun |
| react-router-dom | 6.30.0 | retiré | remplacé par `react-router` 7.18.5 (recommandation officielle v7) : 20 imports modifiés |
| tailwindcss | 3.4.13 | 4.3.5 + `@tailwindcss/vite` | voir ci-dessous |
| postcss, autoprefixer | 8.5.32 / 10.6.2 | retirés | inutiles avec le plugin Vite (postcss reste une dépendance de Vite) |
| recharts, @testing-library/react, /dom | 3.10.1, 16.3.3, 10.4.2 | inchangés | déjà les dernières |

**Tailwind 4.** `npx @tailwindcss/upgrade` a renommé les classes dans 31 fichiers (`rounded` > `rounded-sm`, `rounded-sm` > `rounded-xs`,
`shadow-sm` > `shadow-xs`, `flex-shrink-0` > `shrink-0`, `outline-none` > `outline-hidden`, arbitraires vers l'échelle). Repris à la main :
- tokens de `tailwind.config.js` en `@theme` dans `src/index.css` (couleurs, rayons, ombres, `--height-control*`, durées) ; fichier supprimé ;
- `short:` en `@custom-variant short (@media (max-height: 699px))` ;
- l'outil avait converti `.btn`, `.panel`, `.input-field`... en `@utility` : remis en `@layer components`, sinon l'ordre de tri v4 peut
  faire perdre la surcharge par les utilitaires voisins (`btn btn-sm`, `panel hover:shadow-xs`) ;
- compatibilité v3 : bordure par défaut gray-200, placeholder gray-400, curseur main sur les boutons ;
- palette v3 figée en hex pour les 10 familles utilisées (gray, slate, red, amber, emerald, orange, sky, indigo, violet, purple) :
  la palette oklch v4 décalait jusqu'à 5 niveaux (amber-800 #92400E > #973C00, emerald-700 #047857 > #007A55) et les contrastes du plan design portent sur ces hex ;
- plugin officiel `@tailwindcss/vite` ; `postcss.config.js` supprimé. **src-tauri** : seule ligne ajoutée, `bundle.macOS.minimumSystemVersion: "13.3"` dans `tauri.conf.json`.

## Résultat des commandes (après la dernière étape, puis après `npm ci` propre)

| Commande | Résultat |
|---|---|
| `npm test` | 16 fichiers, 246 passés, 1 ignoré (247), identique à l'avant ; couverture 92,5 % lignes |
| `npx tsc -p tsconfig.app.json --noEmit` | 0 erreur (et tsconfig.node : 0 erreur) |
| `npm run lint` | 0 erreur, 0 avertissement |
| `VITE_DEMO_MODE=true npx vite build` | OK ; aussi OK avec `TAURI_ENV_PLATFORM=windows`, `darwin` et `TAURI_ENV_DEBUG` |
| Parcours de navigation (Chrome, démo) | sidebar, Statistiques, retour, Ctrl+N, filtre par URL : OK, aucune erreur console |

Poids : JS 1 301 > 1 361 Ko (gzip 399 > 415 Ko, React 19 et router 7) ; CSS 41,2 > 48,8 Ko (gzip 7,4 > 9,2 Ko, variables de thème). Portes passées après chacun des 7 commits.

## Comparaison visuelle (démo, avant = commit 82e75aa, après = f482931)

Bruit mesuré entre deux captures du même build : <= 0,01 %. « Visibles » = écart > 16 niveaux sur 255.

| Écran | 1366 : diff / visibles | 1920 : diff / visibles |
|---|---|---|
| Accueil | 0,97 % / 0,08 % | 0,51 % / 0,04 % |
| Saisie vide | 1,17 % / 0,04 % | 0,61 % / 0,02 % |
| Saisie après enregistrement | 1,17 % / 0,04 % | 0,61 % / 0,02 % |
| Liste | 0,96 % / 0,06 % | 0,50 % / 0,03 % |
| Activités | 0,96 % / 0,06 % | 0,50 % / 0,03 % |
| Statistiques (graphiques rendus) | 1,34 % / 0,05 % | 0,49 % / 0,02 % |
| Historique | 0,94 % / 0,05 % | 0,49 % / 0,02 % |
| Contrôle des imports | 0,16 % / 0,03 % | 0,10 % / 0,02 % |
| Préférences (modale) | 0,30 % / 0,05 % | 0,16 % / 0,03 % |
| Écrans bas 900×600 (accueil, saisie avec focus et survol, liste, activités) | 0,13 à 0,78 % / <= 0,10 % | - |

Explication des écarts > 0,5 % : ce sont des écarts de **1 niveau** sur 255, invisibles. Les opacités (`bg-white/10` de l'entrée
active de la sidebar, filets) passent par `color-mix()` en v4 : (48,64,92) devient (48,63,91), la valeur exacte du mélange.
Les écarts visibles (<= 0,1 %) sont les tracés lucide 1.x retouchés au sous-pixel (mêmes formes, vérifié à la loupe).
Aucun décalage de mise en page : aucune ligne ou colonne entière décalée sur aucun écran. L'avant et l'après de la capture CLI
des statistiques diffèrent selon l'instant de l'animation recharts : c'est pourquoi la ligne Statistiques porte sur `stats-rendu`.

## Risques

| Risque | Impact | Rôle |
|---|---|---|
| WebView2 < 111 sur un poste (version fixe, poste hors ligne jamais mis à jour) | CSS v4 non appliqué (`@layer`, `@property`) : interface cassée | SRE / QA |
| macOS 12 et antérieurs : la 2.2.0 ne s'installe plus ; l'updater pourrait la proposer à un poste qui ne pourra pas la lancer | Poste macOS bloqué en 2.1.x ou cassé après mise à jour | SRE (filtrer `darwin` dans latest.json ou annoncer) |
| Démo web : navigateurs antérieurs à Safari 16.4 / Chrome 111 / Firefox 128 | Démo mal rendue | PM |
| TypeScript bloqué en 6.0 tant que typescript-eslint n'accepte pas TS 7 | Montée à refaire plus tard | Front |
| 20 exemptions `react-hooks/set-state-in-effect` (chargements au montage, réinitialisation des modales, animations) | Dette, pas de bug : refonte des effets à planifier hors chantier de versions | Front |
| `eslint.config.js` garde `tseslint.config()` (déprécié au profit de `defineConfig`) : le hook de protection des configs a bloqué la modification | Fonctionne sous ESLint 10, à migrer | Front |
| jsdom 31 et Vitest 5 exigent Node >= 22.22.2 (CI : `>=22.13 <23`, résolu en dernière 22.x) | Tests en échec si la CI tombe sur une 22.x ancienne ; poste local en 24.13 : avertissement EBADENGINE | SRE |
| Conflits attendus avec la branche 2.1.0 : `tauri.conf.json` (bloc `bundle`), `package.json`, `package-lock.json` | Fusion manuelle ; régénérer le lockfile après fusion | Orchestrateur |
| `hover:` v4 ne s'applique qu'aux pointeurs capables de survol (`@media (hover: hover)`) | Pas de survol sur un poste 100 % tactile (sans effet fonctionnel) | QA |

## Reste à tester à l'exécution sous Windows (build Tauri, pas en démo)
1. Version de WebView2 réellement installée (`edge://version` dans la webview ou registre) sur le poste pilote, >= 111.
2. Parcours complet avec SQLite (plugin-sql + React 19) : verrou, création de mot de passe, saisie, modification, suppression, archivage.
3. Les 20 effets exemptés : ouverture / fermeture répétée des modales (formulaire remis à zéro, focus), toasts, rechargements de listes.
4. Import Excel / CSV, export Excel, sauvegarde et restauration (dialogues natifs).
5. Ctrl+N et repli F2, focus clavier visible, curseur main sur les boutons.
6. Écran 1366×768 à 125 % et fenêtre minimale 900×600 (variante `short:`), polices Segoe UI.
7. Mise à jour 2.1.x vers 2.2.0 par l'updater, et `tauri build` macOS avec `minimumSystemVersion` 13.3 (Info.plist).
