# 07 - QA : validation de la montée de versions (2.2.0-rc.1)

Date : 2026-11-07. Rôle : QA (P7), revue indépendante. Branche `chore/deps-2.2.0` à f89147c (worktree), base `main` (2.1.0-rc.2).
Ordre suivi : commandes, puis revue du diff (`main...HEAD`), puis seulement le rapport `05-build-deps-2.2.0.md`.

**Verdict : GO avec risques** pour publier la 2.2.0-rc.1 en pre-release, sous condition du smoke Windows (section 5) sur le poste pilote avant toute diffusion plus large.

## Hypothèses
- HQ1 : l'apparence se juge sur les captures démo du dossier `deps-2.2.0/` (Chromium), le moteur de WebView2. Rien n'a tourné ici sous Windows ni dans Tauri.
- HQ2 : Node local en v24.13.0 (sous le 24.15 exigé par jsdom 31) : les tests passent mais la CI (Node >= 22.22.2 <23) fait foi.

## 1. Commandes (rejouées par la QA, HEAD f89147c, puis avec le test de garde ajouté)
| Commande | Résultat |
|---|---|
| `npx vitest run --coverage` | 16 fichiers, 247 tests passés ; couverture 92,5 % instr., 85,3 % branches, 95,2 % lignes. Avec le test QA : 17 fichiers, 296 tests |
| `npx tsc -p tsconfig.app.json --noEmit` / `tsconfig.node.json` | 0 erreur / 0 erreur |
| `npm run lint` | 0 erreur, 0 avertissement |
| `VITE_DEMO_MODE=true npx vite build` | OK (Vite 8.3.6) : CSS 46,6 Ko (gzip 8,9), JS 1 360 Ko (gzip 415), avertissement de taille de bloc déjà connu |
| `cd src-tauri && cargo test --locked` | OK : 5 + 1 tests |
| `node --test scripts/release-guards.test.mjs` | 9/9 |
| `node scripts/check-migrations.mjs v2.0.2` | OK, 9 migrations publiées intactes, 12 en HEAD |
| `node scripts/check-release-version.mjs v2.2.0-rc.1 v2.0.2` | OK, pre-release |

## 2. Revue du diff : constats
| # | Zone | Constat | Sévérité / rôle |
|---|---|---|---|
| C1 | React 19 | Aucun changement de code React hors imports et commentaires. Pas de `forwardRef`, `defaultProps` de fonction, `ReactDOM.render` ni `act` de `react-dom/test-utils`. `StrictMode` inchangé dans `main.tsx` | RAS |
| C2 | react-router 8 | 20 imports `react-router-dom` vers `react-router`, API déclarative inchangée (`BrowserRouter`, `NavLink`, `useSearchParams`, `navigate(state)`). Retour à la liste et `?retour=saisie` couverts par les tests lot1/lot2 restés verts | RAS, smoke n° 6 |
| C3 | Tailwind : tokens | Les 35 couleurs, rayons, ombres, hauteurs et durées de `@theme` sont **identiques un par un** à `tailwind.config.js` de main (vérifié dans le source et dans le CSS livré). Palette v3 figée en hex (amber-800 #92400e, emerald-700 #047857...) | RAS, garde ajoutée (section 4) |
| C4 | Tailwind : `short:` | `@custom-variant short (@media (max-height: 699px))` sort en `@media (height<=699px)` **après** les points de rupture `sm` à `xl`, comme `screens.short` en v3 : `short:` garde la priorité | RAS |
| C5 | Tailwind : `@layer components` | `.btn`, `.panel`, `.input-field` restent des classes de la couche components : les utilitaires voisins (`btn-sm`, `px-2`, `hover:shadow-xs`) les surchargent toujours. Focus U23 : `ring-2 ring-brand-600 ring-offset-2 ring-offset-white` et contour transparent en `forced-colors` présents | RAS |
| C6 | Tailwind : renommages | `rounded` vers `rounded-sm` (0,25rem) et `rounded-sm` vers `rounded-xs` (0,125rem) : mêmes valeurs. Il ne reste aucun utilitaire v3 retiré (`*-opacity-*`, `flex-shrink-*`, `overflow-ellipsis`, `shadow`/`rounded`/`ring` nus). `ring-2` a toujours une couleur explicite (plus de bleu v3 par défaut) | RAS |
| C7 | Tailwind : sources et compat | `source(none)` + `@source '../index.html'` et `'../src'` : mêmes sources qu'en v3. Les règles de compat (bordure gray-200, placeholder gray-400, curseur main) sont dans la couche base, `.input-field` garde son placeholder gray-500. Les opacités (`bg-white/10`) ont un repli hex avant `color-mix()` | RAS |
| C8 | CSS livré | Aucune classe construite par fragments (`bg-${x}`) : les 3 interpolations trouvées sont des identifiants. Script QA : 491 jetons littéraux extraits, **427 classes, toutes présentes** dans `dist/assets/*.css` ; les 64 « absentes » sont des id, des chemins et des encodages | RAS |
| C9 | lucide 1.70 | Les 12 anciens noms sont, dans 1.70, des **alias exacts** des nouveaux (`TriangleExclamationPoint as AlertTriangle`...). Même sens pour chacun ; `Trash` a toujours les 2 traits de `Trash2` | RAS |
| C10 | lucide : glyphes | Le rapport parle de « tracés retouchés au sous-pixel, mêmes formes ». C'est inexact pour quelques icônes, **renommées ou non** : `Coins` est inversé (pièce pleine à droite), `House`, `CircleCheckBig`, `ChartColumn`, `CircleCheck` et `CalendarDays` sont redessinés. Le sens ne change pas. Ce sont les seuls écarts visibles | Cosmétique, Front (corriger le rapport) |
| C11 | 20 exemptions `set-state-in-effect` | Le diff n'ajoute **que des commentaires**, sans changer le comportement. Elles se répartissent en 12 chargements `void load()` (dépendances stables : `[]`, `[id]`, `[editId]`, `[isEditMode, presetActivityId]`, `setCurrentActivityId` en `useCallback([])`), 5 remises à zéro de modale sur `[open]`, 2 animations (Toast, ConfirmModal sur `[open]`) et 1 purge d'autocomplétion sur `[value, enabled, minChars]`. Aucun setState ne modifie une dépendance de son propre effet : **aucune boucle de rendu** | Dette acceptée (D29), smoke n° 7 |
| C12 | Code modifié pour jsdom | Liens « Modifier » : l'espace est sortie du `sr-only` parce que jsdom 31 ne la comptait plus. Contrôle QA dans Chromium headless (arbre AX via CDP, CSS livré) : nom accessible **identique** avant et après, « Modifier l'inscription de DIOP Awa » | RAS |
| C13 | TS 6 / ESLint 10 | `{ cause }` ajouté sur 4 erreurs relancées, messages inchangés (les assertions sur les messages passent). `Uint8Array<ArrayBuffer>` : typage seul. `lib` ES2022 (Error.cause) : supporté par les cibles chrome111 / safari16.4 | RAS |
| C14 | Build | Cibles `chrome111` / `safari16.4`, minification Oxc. CSP inchangée (`style-src 'unsafe-inline'` déjà là) | Voir risques R1 et R2 |

Bugs : bloquant 0, majeur 0, mineur 0, cosmétique 1 (C10, documentaire).

## 3. Comparaison visuelle recontrôlée (python3 -I, PIL, PNG de `deps-2.2.0/`)
Comme le rapport, « visible » veut dire un écart de plus de 16 niveaux sur 255. J'ai ajouté une recherche d'amas (8-connexité) pour repérer les décalages de mise en page.

| Écran | Diff totale | dont 1 niveau | Visibles (rapport) | Amas visibles, plus grand |
|---|---|---|---|---|
| accueil 1366 | 1,29 % | 1,21 % | 0,077 % (0,08) | 18 amas, 16×16 px max |
| saisie 1366 | 1,29 % | 1,25 % | 0,037 % (0,04) | 22, 14×15 |
| liste 1920 | 0,61 % | 0,58 % | 0,029 % (0,03) | 18, 14×15 |
| stats-rendu 1366 | 1,35 % | 1,30 % | 0,046 % (0,05) | 16, 22×11 |
| saisie-bas 900 | 0,35 % | 0,30 % | 0,048 % (<= 0,10) | 15, 12×9 |
| historique 1366 | 1,05 % | 1,00 % | 0,047 % (0,05) | 19, 14×15 |
| contrôle imports 1366 / préférences 1366 | 0,27 % / 0,32 % | - | 0,030 / 0,048 % (0,03 / 0,05) | - |

Lecture : les pixels visibles recoupent le rapport à 0,01 point près. Ma diff totale est un peu plus haute (accueil 1,29 contre 0,97 %), mais il s'agit à plus de 93 % d'écarts de 1 niveau (`color-mix`), invisibles. Aucun amas ne dépasse 22 px : **pas de décalage de mise en page**. Vus à la loupe (×6), les amas sont des glyphes lucide (C10). L'historique montre aussi des heures différentes (14:26 et 15:06) : les données démo sont horodatées au moment de la capture, ce n'est pas une régression.

## 4. Tests : diff main...HEAD justifié, et ajout QA
- Il y a autant de `it()` qu'avant dans chaque fichier de test de main. Aucun test supprimé ni ignoré.
- 4 fichiers (`RegistrationForm.test`, `.lot1.test`, `.qa-ux.test`, `lot2Screens.test`) ne changent que l'import `react-router-dom` en `react-router`, **sans aucune assertion modifiée**.
- 1 seule assertion change, dans `brand.test.tsx` : `toContain('rounded-sm')` devient `toContain('rounded-xs')` pour le logo Wave. C'est justifié : `rounded-xs` v4 vaut 0,125rem, exactement l'ancien `rounded-sm` v3 (vérifié dans le CSS livré).
- Les tests de non-régression de l'audit et de l'UX passent tous, sans modification : double soumission (M2, QA-06, double Entrée, double clic sur « Créer quand même »), échec d'enregistrement avec le verrou relâché (QA-07), verrou et Ctrl+N inerte (D4, D22), import strict (QA-02, QA-05, QA7-01, QA7-02, 5 Mo, 5000 lignes), contrôle des imports (A1, D15), garde ACL et CSP (QA-01, M6).
- **Ajout QA** : `src/designTokens.test.ts` (49 cas). Il fige les 35 couleurs de l'ancien config, 11 teintes de la palette v3 qui portent des contrastes, les rayons, ombres, hauteurs et durées, la variante `short:`, les sources, l'anneau U23 et la compat v3. Son but : arrêter un `@tailwindcss/upgrade` relancé ou une majeure Dependabot (D28) qui changerait ces valeurs en silence. Il lit le CSS par `process.getBuiltinModule('node:fs')` : Vitest renvoie `''` pour un `?raw` CSS, et ainsi `tsconfig.app` n'a pas besoin des types Node.

## 5. Smoke 2.2.0 Windows (build Tauri signé, poste pilote en 2.1.0-rc.2)
| # | Parcours | Critère de réussite |
|---|---|---|
| S1 | **Avant la mise à jour** : relever la version de WebView2 (registre `HKLM\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}`, valeur `pv`) et le nombre d'inscriptions et d'activités | `pv` >= 111.0 noté ; sinon NO-GO pour ce poste (R1) |
| S2 | Mise à jour par l'updater de 2.1.0-rc.2 vers 2.2.0-rc.1 (proposition, téléchargement, hook NSIS, relance) | Relance sans erreur ; Préférences affichent 2.2.0-rc.1 ; un seul raccourci « Actio » ; mêmes comptes qu'en S1 |
| S3 | Écran de verrouillage : mauvais mot de passe 6 fois, puis le bon | Message, tremblement et compte à rebours ; déverrouillage ; anneau de focus bleu de 2 px visible au clavier |
| S4 | Guichet au clavier : 3 inscriptions (Tab, touches 1/2/3, Entrée), puis Entrée deux fois pendant l'enregistrement, puis Ctrl+N et F2 | 4 inscriptions créées, pas 5 ; bannière « Inscription enregistrée » ; la session les liste |
| S5 | Depuis la session, « Modifier » puis retour à la saisie ; Narrateur sur le lien | Retour sur la saisie ; Narrateur lit « Modifier l'inscription de [nom] » (C12) |
| S6 | Liste : choix d'une activité, filtre, tri, page 2 ; modifier une ligne et enregistrer ; supprimer une ligne | Retour à la liste avec filtres, tri et page conservés ; la modale de confirmation rend le focus au déclencheur |
| S7 | Les modales des 20 effets ouvertes et fermées 3 fois : activité (créer, puis modifier), mot de passe, code de récupération, import ; un toast | Champs remis à zéro à chaque ouverture ; pas de gel, ventilateur et processeur au calme ; le toast se ferme seul |
| S8 | Import Excel (`# ##0`, dates courtes) et CSV windows-1252, puis Contrôle des imports et « Appliquer la suggestion » | Aperçu et totaux justes, accents conservés ; bannière et correction OK |
| S9 | Export Excel, sauvegarde manuelle, restauration (dialogues natifs) | Fichier ouvert dans Excel ; la restauration remet les données de la sauvegarde |
| S10 | Statistiques d'une activité, puis retour | Graphiques rendus (barres, ligne, camembert), couleurs Wave, OM et espèces identiques à la 2.1 |
| S11 | Affichage : 1366×768 à 125 %, puis fenêtre réduite à 900×600 ; survol à la souris | Pas de débordement ; espacements compacts (`short:`) ; bordures grises (pas noires) ; curseur main et survol sur les boutons ; icônes C10 jugées acceptables par le pilote |
| S12 | Historique et Préférences (verrouillage auto, « Rechercher une mise à jour ») | Les événements de S3 à S9 sont listés ; « à jour » affiché ; aucune erreur dans les journaux |

## 6. Risques résiduels
| Risque | Impact | Mitigation | Rôle |
|---|---|---|---|
| R1 WebView2 ancien sur un poste hors ligne. `webviewInstallMode: offlineInstaller` n'installe WebView2 que s'il est absent et **ne met pas à jour un runtime existant**, ni à l'installation ni par l'updater. Rupture nette sous Chromium 99 (`@layer` ignoré, plus aucun style) ; entre 99 et 110, risque résiduel pour le JS (cible chrome111) | Interface cassée après la mise à jour | S1 obligatoire ; proposition : contrôle de `pv` dans le hook NSIS, qui lance l'installeur embarqué si < 111 | SRE, PM |
| R2 macOS 12 et antérieurs : l'updater proposera la 2.2.0 (aucun filtre sur `minimumSystemVersion`), et macOS refusera de la lancer | Poste Mac bloqué après la mise à jour | Pas de Mac au pilote ? Sinon, `latest.json` sans plateforme darwin pour la 2.2.0 | PM, SRE |
| R3 Démo web sur un navigateur antérieur à Chrome 111, Safari 16.4 ou Firefox 128 | Démo mal rendue | Mention dans la page démo | PM |
| R4 Glyphes lucide redessinés (C10) | Repère visuel légèrement différent pour les habitués | Validé au pilote en S11 | Design |
| R5 Survol réservé à `@media (hover: hover)` | Pas de survol sur un poste 100 % tactile | Sans effet fonctionnel | Design |
