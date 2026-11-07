# 02 - Design UX/UI : revue et plan d'évolution d'Actio

Date : 2026-11-07. Rôle : Product Designer (P2 Expérience, Revue puis plan). Lecture seule sur `src/`.
Lu : 00-contexte, decisions, revue-frontend, 05-build-front, 14 captures (7 écrans × 1366 et 1920), code des écrans.
Maquette de référence : `docs/squad/maquettes/saisie-guichet.html` (écran de saisie cible, autonome, à ouvrir hors ligne).
Les constats déjà traités par revue-frontend / 05-build-front (M1 à M10, m1 à m21) ne sont pas répétés.

## Hypothèses
- HD1 : à 1366×768, la zone utile de la webview fait environ 1366×700 (barre des tâches Windows + barre de titre).
- HD2 : au guichet, plus de 90 % des inscriptions sont datées du jour et concernent une seule activité par séance.
- HD3 : en plein jour, on vise ≥ 7:1 pour le texte principal et ≥ 4,5:1 pour tout texte secondaire (AA = 4,5:1).
- HD4 : les graphiques vides de `stats_1366.png` sont une capture prise pendant l'animation recharts (les KPI affichent 5
  inscriptions) ; ce n'est pas une perte de données. À confirmer par QA.
- HD5 : aucun test avec de vrais opérateurs n'a eu lieu ; les constats viennent d'une revue heuristique, des captures et du code.
- HD6 : après chaque enregistrement, le mode de paiement revient à « Espèces » (on ne propage pas un mode non vérifié).

## Synthèse
- **Plus fort impact : la saisie au guichet (axe a).** Enchaîner deux inscriptions coûte aujourd'hui 4 clics, 8 à 10 Tab,
  une attente de 1,2 s, un passage forcé par l'écran de choix de liste, et l'activité revient sur « Général » à chaque fois
  (risque d'erreur silencieuse sur la caisse). Lot 1.
- **Clarté (axe b)** : micro-textes de 10 à 12 px en majuscules espacées, actions en icônes seules, phrases fausses
  (« Activité en cours » + « Il y a 96 jours »), action dangereuse « Restaurer » dans la barre de travail quotidienne. Lot 2.
- **Identité (axe c)** : le logo (marine #192A49, bleu #4B85CD, vert #45BB3D) n'est repris nulle part ; les couleurs de
  paiement sont codées en dur à 4 endroits et Wave a la couleur du bouton primaire. Les tokens sont posés dès le Lot 1, la
  finition visuelle vient au Lot 3.

## 1. Constats

Impact : Fort / Moyen / Faible. Effort : S (≤ 1 j), M (2 à 4 j), L (> 4 j).

| ID | Écran | Constat (preuve) | Axe | Impact | Effort |
|---|---|---|---|---|---|
| U1 | Saisie | Depuis la sidebar, l'activité est « Général » et le montant vide (`saisie_1366.png` ; `RegistrationForm.tsx:55` `presetActivityId \|\| DEFAULT_ACTIVITY_ID`). L'activité en cours de l'accueil (`localStorage home.currentActivityId`, `Home.tsx:43`) est ignorée : 2 clics de plus et risque d'inscrire dans la mauvaise activité | a | Fort | S |
| U2 | Saisie | Après succès : écran plein « Redirection... » 1,2 s puis renvoi vers la Liste (`RegistrationForm.tsx:175`), qui rouvre l'écran de choix (`RegistrationList.tsx:163`). Pour la suivante il faut repasser par la sidebar, et U1 se reproduit | a | Fort | M |
| U3 | Saisie | Aucun focus initial (pas d'`autoFocus`, vérifié par grep) : un clic dans « Nom » avant chaque saisie | a | Fort | S |
| U4 | Saisie | La date (presque toujours aujourd'hui) est dans l'ordre de tabulation avant le montant, avec jusqu'à 3 arrêts (jour, mois, année) dans WebView2 (`RegistrationFormParts.tsx:139`) | a | Moyen | S |
| U5 | Saisie | Adresse en `textarea` obligatoire (`RegistrationForm.tsx:317`, `registrationFormModel.ts:33`) : Entrée y crée un saut de ligne au lieu de valider | a | Moyen | S |
| U6 | Saisie | Paiement en boutons radio de 14 px sans couleur ni raccourci (`RegistrationFormParts.tsx:27-40`). Ordre différent selon l'écran : Espèce/Wave/OM (saisie), Wave/OM/Espèce (accueil), Wave/Espèce/OM (stats) | a, c | Moyen | S |
| U7 | Saisie | Montant en `type="number"` : la molette modifie la valeur du champ actif, flèches de spin, pas de séparateur de milliers à l'écran (« 25000 ») | a | Moyen | S |
| U8 | Saisie | Autocomplétion : les 3 champs partagent `id="contact-suggestions"` (`ContactAutocomplete.tsx:131,137`), pas d'`aria-activedescendant`, suggestions en 12 et 11 px, rien n'indique qu'un contact a rempli 4 champs | a, b | Moyen | S |
| U9 | Saisie | Doublon : « Créer quand même » en bouton rouge (`RegistrationForm.tsx:375`) pour une action légitime (D9) ; le message ne montre ni date ni montant de l'inscription existante | b | Faible | S |
| U10 | Saisie, global | Champs d'environ 32 px, libellés 12 px, boutons 28 px en `text-xs` (`index.css:37,61`), bordure des champs `gray-300` à 1,47:1 sur blanc (WCAG 1.4.11 demande 3:1) : petit et peu visible sur un portable en extérieur, pour des opérateurs peu à l'aise | a, b | Fort | S |
| U11 | Accueil | « Activité en cours » + « Il y a 96 jours » + ligne « Temps restant : Il y a 96 jours » pour une sortie passée (`accueil_1366.png` ; `Home.tsx:230-249`, `HomeSections.tsx:173-178`). `pickCurrentActivity` retombe sur la dernière créée même si elle est passée (`Home.tsx:55-56`) | b | Moyen | S |
| U12 | Accueil | Jargon et bruit : « Panier moyen », « Couleur #16A34A », tiret long seul en légende (`Home.tsx:292,307`, `HomeSections.tsx:189-199`) | b | Faible | S |
| U13 | Accueil | L'action principale « Nouvelle inscription » est un bouton de 28 px sous les KPI (`Home.tsx:320`) ; pas de caisse du jour par mode, utile à la clôture du guichet | a, b | Moyen | S |
| U14 | Liste | L'écran de choix de liste s'affiche à chaque visite et après chaque modification (`RegistrationList.tsx:163`) : contexte et filtres perdus | b | Fort | S |
| U15 | Liste | 10 contrôles sur une ligne dont « Sauvegarder / Restaurer » (`RegistrationList.tsx:243`) : une action qui remplace toute la base est à côté d'« Excel », dans l'espace de travail quotidien | b | Moyen | M |
| U16 | Activités | 5 actions en icônes seules, cibles de 26 px, sens porté par `title` (`Activities.tsx:189-248`, `activites_1366.png`) : « Importer » et « Exporter » se confondent | b | Moyen | S |
| U17 | Activités, Liste | Lignes archivées en `opacity-60` (`Activities.tsx:156`) : le texte gris tombe sous 3:1. Titre « Archivées » en gray-500 sur gray-100 = 4,39:1 | b | Faible | S |
| U18 | Stats | Axe des montants arrondi faux : 2 500 affiché « 3k » (`ActivityStats.tsx:256`, `toFixed(0)`) ; axe des inscriptions en 0,5 / 1,5 ; légendes écrites dans la couleur du secteur (#10b981 = 2,5:1, #f97316 = 2,8:1) | b | Moyen | S |
| U19 | Stats | Animations recharts actives même avec `prefers-reduced-motion` (le CSS de `index.css:99` ne les touche pas) ; pas d'export depuis la page stats (besoin du responsable) | b | Faible | S |
| U20 | Historique | Barre d'outils collée aux bords (hors du `p-6` des autres pages) ; « Effacer » rouge plein au même poids que « Recharger » (`Audit.tsx:170-182`) ; « Entité » est du jargon | b | Faible | S |
| U21 | Global | Microcopie : « Espèce » au singulier (`uiFormat.ts:9`) ; « Type de paiement », « Mode de paiement », « Paiement » selon l'écran | b | Faible | S |
| U22 | Global | Textes de 10 et 11 px en majuscules espacées (KPI, bandeaux, version : `HomeSections.tsx:134`, `RegistrationListParts.tsx:62`, `App.tsx:170`) ; tableaux en 12 px | b | Fort | M |
| U23 | Global | Anneau de focus de 1 px (`index.css:17`, `input-field` `focus:ring-1`) : invisible en plein soleil, gênant pour une saisie au clavier | a, b | Moyen | S |
| U24 | Global | Couleurs de paiement codées à 4 endroits (`HomeSections.tsx:8`, `RegistrationListParts.tsx:53`, `RegistrationTable.tsx:12`, `ActivityStats.tsx:33`) ; Wave = bleu primaire ; teintes -500 sous 3:1 sur blanc (émeraude 2,5:1, orange 2,8:1) pour les barres, points et secteurs | c | Moyen | S |
| U25 | Global | Largeurs incohérentes : Accueil `max-w-6xl`, Saisie `max-w-2xl`, Liste `max-w-5xl`, Activités `max-w-3xl`, Historique pleine largeur (captures 1920 : moitié droite vide, bords gauches décalés) | c | Faible | S |
| U26 | Global | Identité : sidebar gray-900 neutre, bleu Tailwind par défaut, rayons 4 px, panneaux sans relief ; `tailwind.config.js` `extend: {}` vide, aucune source de vérité | c | Moyen | S |
| U27 | Sidebar | Version en gray-500 sur gray-900 = 3,7:1 en 10 px (`App.tsx:170`) ; « Nouvelle inscription » n'est pas distinguée des autres entrées | b, c | Faible | S |
| U28 | Activités | Chargement en spinner, pas en skeleton (`Activities.tsx:131-137`) | c | Faible | S |
| U29 | Démo | Le badge « Mode démonstration » recouvre le pied de la sidebar (`DemoBanner.tsx:13`) | c | Faible | S |

**Parcours mesuré (analyse du code, Tab dans WebView2 à confirmer par QA), contact nouveau, depuis la sidebar :**

| Geste hors données | Aujourd'hui | Cible Lot 1 |
|---|---|---|
| Clics | 4 (menu, liste d'activités, option, champ Nom) | 0 |
| Tab / flèches | 8 à 10 (dont 3 dans la date) + 1 à 2 flèches | 5 + une touche 1/2/3 |
| Validation | Entrée ou clic, puis 1,2 s d'attente et retour forcé à la Liste | Entrée, formulaire prêt aussitôt |
| Contact déjà connu | Idem moins la frappe de 3 champs | 2 lettres, Entrée sur la suggestion, focus sauté sur Paiement : 3 à 4 gestes |

## 2. Fondations (tokens)

Contrastes calculés avec la formule de luminance relative WCAG 2.x (arrondis au centième inférieur).

| Token | Valeur | Usage | Contraste vérifié |
|---|---|---|---|
| `brand-900` | #192A49 (marine du logo) | fond de sidebar | blanc 14,3:1 ; `slate-300` #CBD5E1 9,6:1 ; `slate-400` #94A3B8 5,5:1 |
| `brand-600` | #2563B8 | bouton primaire, liens, anneau de focus | blanc sur lui 5,9:1 ; sur blanc 5,9:1 ; sur gray-100 5,3:1 |
| `brand-700` | #1E4F94 | survol primaire, texte sur `brand-50` | blanc 8,0:1 ; sur `brand-50` 7,2:1 |
| `brand-500` | #4B85CD (bleu du logo) | indicateur actif sidebar, graphique neutre | sur blanc 3,7:1 ; sur `brand-900` 3,7:1 (élément graphique ≥ 3) |
| `brand-50` | #EEF4FB | sélection, survol de ligne | fond |
| `ink` / `ink-soft` / `ink-muted` | #111827 / #374151 / #4B5563 | texte principal / libellés / secondaire (minimum) | sur blanc 17,7 / 10,3 / 7,5:1 ; `ink-muted` sur gray-100 6,8:1 |
| `cash` (Espèces) | texte #047857, remplissage #059669, fond #D1FAE5, encre #065F46 | badges, segments, sélection | blanc sur #047857 5,4:1 ; #059669 sur blanc 3,7:1 ; #065F46 sur #D1FAE5 6,7:1 |
| `wave` (Wave) | texte #0369A1, remplissage #0284C7, fond #E0F2FE, encre #075985 | idem (bleu ciel, distinct du primaire) | blanc sur #0369A1 5,9:1 ; #0284C7 sur blanc 3,8:1 ; #075985 sur #E0F2FE 6,5:1 |
| `om` (Orange Money) | texte #C2410C, remplissage #EA580C, fond #FFEDD5, encre #9A3412 | idem | blanc sur #C2410C 5,1:1 ; #EA580C sur blanc 3,5:1 ; #9A3412 sur #FFEDD5 6,3:1 |
| `danger` | #B91C1C, fond #FEF2F2 | destructif, erreurs | blanc 6,4:1 |
| `warning` | encre #92400E, fond #FFFBEB | avertissements (événement passé, imports) | 6,8:1 |
| `success` | = encre `cash`, fond #ECFDF5 | confirmations (toujours avec l'icône coche) | 6,7:1 |

Règles : jamais la couleur seule (chaque mode de paiement = icône + libellé : `Banknote` Espèces, `Waves` Wave,
`Smartphone` Orange Money) ; texte en teinte -700/-800 seulement, teintes -600 réservées aux remplissages graphiques ;
`gray-400` et `gray-500` interdits pour du texte ; plus d'`opacity` sur du texte (état archivé = badge « Archivée »).

```js
// tailwind.config.js : theme.extend proposé (le Front l'applique ; les classes Tailwind existantes restent valides)
extend: {
  colors: {
    brand: { 50: '#EEF4FB', 100: '#D9E6F6', 500: '#4B85CD', 600: '#2563B8', 700: '#1E4F94', 900: '#192A49' },
    ink: { DEFAULT: '#111827', soft: '#374151', muted: '#4B5563' },
    surface: { DEFAULT: '#FFFFFF', app: '#F3F4F6', subtle: '#F9FAFB', line: '#D1D5DB' },
    cash: { DEFAULT: '#047857', fill: '#059669', soft: '#D1FAE5', ink: '#065F46' },
    wave: { DEFAULT: '#0369A1', fill: '#0284C7', soft: '#E0F2FE', ink: '#075985' },
    om:   { DEFAULT: '#C2410C', fill: '#EA580C', soft: '#FFEDD5', ink: '#9A3412' },
    danger:  { DEFAULT: '#B91C1C', soft: '#FEF2F2', line: '#FCA5A5' },
    warning: { DEFAULT: '#92400E', soft: '#FFFBEB', line: '#FCD34D' },
    success: { DEFAULT: '#065F46', soft: '#ECFDF5', line: '#6EE7B7' },
  },
  borderRadius: { control: '6px', card: '8px' },
  boxShadow: { card: '0 1px 2px 0 rgb(17 24 39 / 0.06)', pop: '0 10px 30px -5px rgb(17 24 39 / 0.25)' },
  height: { control: '2.25rem', 'control-lg': '2.75rem' },       // 36 px, 44 px
  minHeight: { control: '2.25rem', 'control-lg': '2.75rem' },
  transitionDuration: { fast: '120ms', base: '200ms' },
},
```

- **Typographie** : police système conservée (Segoe UI sous Windows, SF sous macOS). Décision : pas de police ajoutée
  (0 Ko, rendu ClearType, aucune question de CSP ; l'identité passe par la couleur, le logo et la cohérence). Échelle
  Tailwind existante, ratio ≈ 1,2 : `text-xs` 12/16 = méta et aide (minimum absolu, `text-[10px]` et `text-[11px]`
  interdits) ; `text-sm` 14/20 = corps, tableaux, boutons ; `text-base` 16/24 = champs de saisie ; `text-xl` 20/28 = titre
  de page ; `text-2xl` 24/32 = valeur de KPI. Titres de carte en casse normale `text-sm font-semibold text-ink-soft`
  (plus de majuscules espacées). Montants : `tabular-nums` partout.
- **Espacements** (échelle de 4 px) : page `px-6 py-5`, carte `p-4`, écart entre cartes `gap-4`, entre champs `gap-4`,
  libellé/champ `mb-1`. Conteneur unique : `max-w-6xl` pour toutes les pages (Historique compris).
- **Rayons et ombres** : contrôles `rounded-control` (6 px), cartes et modales `rounded-card` (8 px), badges `rounded-full` ;
  cartes `shadow-card`, popovers et modales `shadow-pop`.
- **Focus** (`index.css`) : `*:focus-visible { @apply outline-none ring-2 ring-brand-600 ring-offset-2 ring-offset-white }` ;
  champs : `focus:ring-2 focus:ring-brand-600 focus:border-brand-600` (offset 0) ; dans la sidebar : `ring-white
  ring-offset-brand-900`. 2 px, contraste ≥ 5,3:1 sur tous les fonds clairs.
- **Mouvement** : survol `duration-fast`, apparition `duration-base` sur `opacity`/`transform` uniquement ; recharts
  `isAnimationActive={!prefersReducedMotion}` (lu une fois via `matchMedia`).
- **Composants de base** (`@layer components`) : `.btn` en `text-sm h-control px-3` ; tailles `.btn-sm` (32 px, lignes de
  tableau) et `.btn-lg` (`h-control-lg px-4`, actions du guichet) ; variantes existantes + `.btn-danger-ghost` (texte
  `danger`, fond transparent). `.input-field` en `h-control text-sm`, `.input-lg` en `h-control-lg text-base`.
  `.panel` = `bg-white border border-gray-200 rounded-card shadow-card`. Bordure des champs : aujourd'hui `gray-300`
  (#D1D5DB, 1,47:1 sur blanc, sous le 3:1 exigé pour délimiter un champ, `index.css:61`) ; passer à `gray-500` #6B7280 = 4,8:1.
- **Source unique des paiements** : nouveau `src/components/paymentMeta.ts` exportant, pour `cash | wave | orange_money`,
  `{ label, icon, order, textClass, fillClass, softClass, inkClass, hex }`, ordre fixe Espèces, Wave, Orange Money.
  Utilisé par Saisie, Accueil, Liste (bandeau et badges), Stats, Import. Libellé `cash` = « Espèces ».

## 3. Plan d'évolution (3 lots, ordre recommandé : a puis b puis c)

### Lot 1 : saisie au guichet (axe a) - U1 à U10, U23, tokens. Effort total ≈ M (4 à 5 j Front)

Prérequis 1.0 (S) : appliquer `theme.extend`, l'anneau de focus 2 px et `paymentMeta.ts` (section 2).

**1.1 Activité du guichet partagée (U1, S).** Hook `useCurrentActivity()` qui lit et écrit la clé existante
`home.currentActivityId` (aucune migration). Création : activité = `?activity=` sinon activité courante si elle est
vivante, sinon première vivante. Changer l'activité dans le formulaire met à jour l'activité courante (l'accueil suit).
Le select passe dans une barre en tête du formulaire : « Inscription pour [● Sortie Plage · 3 août 2026 ▾]
Montant habituel : 2 500 F ». Si la date de l'activité est passée : badge `warning` « Événement passé » à côté.
*Critère* : depuis l'accueil réglé sur « Sortie Plage », clic sur la sidebar → le formulaire affiche Sortie Plage et
2 500 F ; après redémarrage de l'app, idem.

**1.2 Enregistrer et enchaîner (U2, U3, M).** En création, après succès : pas de redirection. Le formulaire se vide
(Nom, Prénoms, Téléphone, Adresse), garde activité et date, remet le montant habituel et « Espèces », remet le focus sur
Nom. Bandeau `role="status"` (fond `success-soft`, icône coche) : « Inscription enregistrée : DIOP Awa · 2 500 F · Wave. »
+ lien « Modifier » ; il reste jusqu'au prochain enregistrement. Pied : « Effacer la saisie » (ghost, à gauche),
« Voir la liste » (secondaire, ouvre la liste de l'activité courante), « Enregistrer » (`btn-lg` primaire, indication
« Entrée »). En modification : après « Mettre à jour », retour à la page d'origine (Liste avec son contexte, ou Saisie si
`?retour=saisie`) avec toast « Inscription modifiée. », sans écran d'attente. `autoFocus` sur Nom à l'arrivée.
*Critères* : 3 inscriptions enchaînées sans souris ni attente ; après chaque Entrée le focus est sur Nom en moins de 300 ms ;
un lecteur d'écran annonce le bandeau ; la modification depuis le panneau de session revient à la Saisie.

**1.3 Panneau « Saisies de cette session » (nouveau composant, S).** À droite du formulaire à partir de `lg` (1024 px),
dessous en dessous. Alimenté par le retour de `addRegistration` (aucun appel Back nouveau), conservé en `sessionStorage`
(20 dernières : id, nom, montant, mode, heure), vidé à la fermeture de l'app. Contenu : total (nombre et montant),
une pastille par mode (« Espèces 3 · 7 500 F »), les 5 dernières lignes (heure, NOM Prénom, badge mode, montant,
« Modifier » → `/edit/:id?retour=saisie`), « et N plus anciennes · Voir la liste ».
États : **vide** « Aucune saisie pour l'instant. Chaque inscription enregistrée s'affichera ici pour vérification. » ;
**chargement** sans objet (mémoire locale) ; **partiel** 1 à 4 lignes, sans la ligne « plus anciennes » ; **erreur** un
échec d'enregistrement n'ajoute rien, l'erreur reste dans le formulaire ; une inscription supprimée ailleurs est retirée
au retour sur la page ; **idéal** voir la maquette. *Critère* : après 6 saisies, total et pastilles égaux à la somme des
6 lignes ; noms de 40 caractères tronqués avec `title`, sans casser la grille.

**1.4 Ordre, clavier, champs (U4 à U7, U10, S).** Grille 2 colonnes, formulaire `max-w-[45rem]` :
Nom | Prénoms ; Téléphone | Adresse ; Mode de paiement (3 boutons) + Montant ; ligne « Date d'inscription : aujourd'hui,
07/11/2026 · Changer la date ». Ordre de tabulation : Nom → Prénoms → Téléphone → Adresse → Paiement (un seul arrêt)
→ Montant → Enregistrer. « Changer la date » révèle le champ date en place et lui donne le focus ; une date différente
d'aujourd'hui reste affichée en `warning` (« Date : 05/11/2026, différente d'aujourd'hui »).
- Adresse : `input` mono-ligne (Entrée valide), `maxLength` 200. Caractère obligatoire inchangé (question PM).
- Paiement : 3 étiquettes de 44 px portant de vrais `input type="radio"` (`sr-only`), icône + libellé + chiffre 1/2/3.
  Flèches natives ; touches 1, 2, 3 quand le groupe a le focus. Sélectionné : fond `cash`/`wave`/`om` DEFAULT, texte
  blanc, icône coche. Non sélectionné : fond blanc, bordure `gray-500`, pastille `fill`.
- Montant : `type="text" inputMode="numeric"`, aligné à droite, suffixe « F CFA » dans le champ, affichage « 25 000 » à la
  sortie du champ ; `parseAmountXof` accepte déjà les espaces (`utils/amount.ts:20`) ; pas de molette.
- Tous les champs `.input-lg` (44 px, 16 px), libellés `text-sm font-semibold`, erreurs `text-sm text-danger` avec icône.
  À l'envoi invalide : focus sur le premier champ en erreur.
- Raccourci global **Ctrl+N** : ouvre la Saisie ; déjà sur la Saisie, remet le focus sur Nom sans rien effacer. Indiqué
  dans la sidebar (`kbd`). Si WebView2 intercepte Ctrl+N, repli sur F2 (à vérifier par le Front).
*Critères* : contact nouveau saisi avec 5 Tab, une touche 1/2/3 et Entrée ; la molette ne change jamais le montant ;
le formulaire complet (bandeau compris) tient sans défilement dans 1366×700 et dans 900×600 avec le panneau dessous.

**1.5 Autocomplétion (U8, S).** Identifiants uniques (`${id}-suggestions`, `${id}-opt-${i}`), `aria-activedescendant`,
texte 14 px. Après choix d'un contact : focus sauté sur le groupe Paiement et ligne `role="status"` sous Nom
« Coordonnées reprises du carnet : 77 123 45 67 ». *Critère* : contact connu enregistré en ≤ 4 gestes hors frappe du nom.

**1.6 Doublon (U9, S).** Bouton « Créer quand même » en primaire (pas rouge), focus initial sur « Annuler » conservé ;
message : « DIOP Awa (77 123 45 67) est déjà inscrite à Sortie Plage le 02/11/2026 pour 2 500 F (Wave). Créer une
seconde inscription ? ».

**États du formulaire de saisie (composant modifié)** : **vide** activité préchoisie, focus sur Nom, panneau vide ;
**chargement** activités en cours de lecture : select désactivé « Chargement des activités... », champs saisissables,
Enregistrer désactivé (lecture locale < 200 ms) ; **partiel** seule « Général » existe : barre d'activité avec lien
« Créer une activité » ; **erreur** chargement des activités (existant, avec Réessayer), échec d'enregistrement (existant,
saisie conservée), validation (focus premier champ) ; **idéal** maquette. Verrouillage pendant la saisie : D4 conserve tout.

### Lot 2 : clarté et lisibilité (axe b) - U11 à U22. Effort ≈ M (3 à 4 j)

**2.1 Accueil (U11 à U13, S).** Barre d'activité : « Activité en cours » conservé, à droite un statut toujours vrai :
« Dans 12 jours » / « Aujourd'hui » / badge `warning` « Terminée le 3 août 2026 ». Suppression de la ligne « Temps
restant » et de « Couleur ». « Nouvelle inscription » passe dans cette barre en `btn-lg` primaire (même lien
`?activity=`). KPI : libellés en casse normale 12 px `ink-muted` ; « Panier moyen » → « Moyenne par inscription » ;
légende vide « Aucune aujourd'hui » au lieu du tiret. Carte « Modes de paiement » : bascule « Aujourd'hui | Toute
l'activité » (deux boutons `aria-pressed`), « Aujourd'hui » par défaut, pour compter la caisse du jour.
`pickCurrentActivity` : à défaut d'activité à venir, préférer la plus récemment passée plutôt que la dernière créée.
*Critères* : activité passée → le mot « Terminée » apparaît, jamais « en cours » avec une durée passée ; avec 0
inscription aujourd'hui la carte affiche « Aucune inscription aujourd'hui » et le lien « Nouvelle inscription ».

**2.2 Liste (U14, U15, S puis M).** Mémoriser en `sessionStorage` la dernière liste ouverte et ses filtres ; à l'arrivée,
rouvrir cette liste ; l'écran de choix ne s'affiche qu'au premier passage de la session ou via « Changer de liste ».
Barre d'outils : recherche élargie (`w-72`, placeholder « Nom, prénom ou téléphone » + libellé `sr-only`), puis filtres,
puis à droite « Exporter Excel ». « Sauvegarder » et « Restaurer » quittent la Liste pour Préférences > Sauvegardes, à
côté des sauvegardes automatiques (question PM). Badges de mode avec icône. Tableau en `text-sm`, actions de ligne 36 px.
*Critères* : modifier une inscription depuis la liste « Sortie Plage » filtrée sur Wave ramène à la même liste, même
filtre, même page ; aucune action de remplacement de base n'est atteignable depuis la Liste.

**2.3 Activités (U16, U17, U28, S).** « Statistiques » et « Exporter » deviennent des boutons texte `btn-sm` avec icône ;
« Importer », « Modifier », « Archiver », « Supprimer » restent des icônes de 36 px avec `aria-label` et infobulle.
Archivées : plus d'`opacity`, badge « Archivée » et texte `ink-muted`. Chargement : skeleton de 4 lignes.
*Critère* : un opérateur trouve « Exporter » sans survol ; axe DevTools : 0 erreur de contraste sur la page.

**2.4 Stats (U18, U19, S).** Axe Y montants : `formatAmount` compact exact (« 2 500 ») ; axe des inscriptions
`allowDecimals={false}` ; légendes en `ink-soft` avec pastille colorée ; remplissages `paymentMeta.hex` (teintes -600) ;
animations coupées si mouvement réduit ; bouton « Exporter Excel » dans l'en-tête ; tableau `sr-only` des valeurs (m22).
*Critère* : pour 2 500 F, l'axe et l'infobulle affichent 2 500, jamais « 3k ».

**2.5 Typographie et microcopie globales (U20 à U22, M).** Remplacer `text-[10px]` et `text-[11px]` par `text-xs`,
retirer `uppercase tracking-wider` des titres de carte et KPI, tableaux en `text-sm`. « Espèces » partout ; « Mode de
paiement » partout ; Historique : « Entité » → « Concerne », « Effacer » → « Effacer l'historique » en `btn-danger-ghost`
séparé des filtres et poussé à droite. *Critère* : grep `text-\[1[01]px\]` = 0 résultat ; zoom 200 % sans perte
d'information à 1366.

### Lot 3 : identité Actio et finition (axe c) - U24 à U27, U29. Effort ≈ S à M (2 j)

**3.1 Sidebar.** Fond `brand-900`, texte `slate-300`, entrée active : fond blanc 10 %, filet gauche 3 px `brand-500`,
texte blanc ; « Nouvelle inscription » affiche `kbd` Ctrl+N ; version en `slate-400` 12 px. Même structure, mêmes entrées.
**3.2 Surfaces.** `.panel` en `rounded-card shadow-card` ; conteneur `max-w-6xl px-6 py-5` sur toutes les pages, Historique
compris ; titres de page `text-xl`. **3.3 Boutons.** Primaire `brand-600`/`brand-700`, toutes tailles `text-sm` ; plus aucun
bouton de 28 px hors tableaux. **3.4 Démo.** Badge démo déplacé en haut à droite de la zone principale.
*Critères* : capture 1366 et 1920 de chaque page : bord gauche du contenu aligné à 232 px ; aucune couleur de paiement
hors `paymentMeta` (grep `bg-blue-500|#3b82f6|#10b981|#f97316` = 0 dans les écrans).

## 4. Hors périmètre (refonte)
- Nouvelle navigation, nouvelles pages ou fusion d'écrans (la sidebar et les routes restent).
- Thème sombre (le terrain est en plein jour ; les tokens le permettront plus tard).
- Mode tactile ou tablette dédié.
- Librairie de composants (shadcn, Radix) ou de graphiques, police web.
- Nouveaux indicateurs statistiques, tableaux croisés, comparaison entre activités.
- Reçu imprimé ou SMS de confirmation, carte membre, QR code.
- Encaissement réel Wave / Orange Money (API), toujours déclaratif (H3).
- Comptes multiples et rôles (H2 : un poste, un opérateur).
- Traductions (anglais, wolof, etc.).
- Illustrations de marque et animations décoratives.

## 5. Métriques de succès et mesure hors ligne
| Métrique | Aujourd'hui | Cible | Mesure simple |
|---|---|---|---|
| Gestes hors données par inscription enchaînée (contact nouveau) | 13 à 16 | ≤ 7 | Script de 10 fiches papier, observateur qui compte clics, Tab, Entrée, sur un portable 1366×768 |
| Temps pour 10 inscriptions enchaînées | à mesurer avant Lot 1 | - 30 % | Même script, chronomètre, 3 opérateurs, médiane avant / après |
| Inscriptions sur « Général » alors qu'une activité vivante existe | à mesurer | ≈ 0 | Export Excel par activité, ou `SELECT COUNT(*) ... WHERE activity_id = 'general'` sur une copie de la base |
| Corrections dans les 10 min suivant une création | à mesurer | - 50 % | Historique (journal d'audit) : couples « créée » / « modifiée » sur la même inscription |
| Réussite sans aide (5 opérateurs, 3 tâches : enchaîner 3 inscriptions, corriger la 2e, dire le total espèces du jour) | non testé | ≥ 4/5 par tâche, SUS ≥ 75 | Test d'utilisabilité sur le build de démo, facilitateur muet |
| Accessibilité | non mesuré | 0 erreur de contraste, focus visible partout | axe DevTools sur les 7 écrans, parcours complet au clavier |

Pas d'instrumentation embarquée proposée (app hors ligne, données personnelles) ; un chronométrage local opt-in est une
question ouverte.

## Annexe : points non traités ici, une ligne chacun
- Modales sans piège de focus (m2), téléphone E.164 (m13), alternative texte des graphiques (m22, repris en 2.4) : Front.
- Dates `new Date('AAAA-MM-JJ').toLocaleDateString()` (`RegistrationTable.tsx:102`, `Activities.tsx:176`) : sûres en UTC+0/+1, décalées à l'ouest ; utiliser le formatage sans objet `Date` de 05 (A1).
- « Mot de passe » et « Code de récupération » pourraient rejoindre Préférences : reporté, la structure de la sidebar reste.
