# 05 - Construction Front : UX Lot 1 « saisie au guichet »

Date : 2026-11-07. Rôle : Développeur Front-End (P5). Branche `ux/lot-1` sur 60516d5, aucun commit.
Spécification : 02-design-ux.md §2 et §3 Lot 1, maquette `saisie-guichet.html`, décisions D19 à D22.

## Hypothèses
- HL1 : un `preventDefault` sur Ctrl+N suffit dans WebView2. F2 fonctionne dans tous les cas. Non vérifiable ici (pas de Windows).
- HL2 : le `sessionStorage` de la webview est vidé à la fermeture de l'app, donc le panneau de session aussi. À confirmer par QA.
- HL3 : le chronométrage garde les 200 dernières durées et ignore celles de plus de 30 min (pause, client parti).

## Réalisé (ID → fichiers)
| ID | Réalisation | Fichiers |
|---|---|---|
| 1.0 tokens, U23, U10 | `theme.extend` §2 (brand, ink, surface, cash/wave/om, danger/warning/success, rayons, ombres, hauteurs, durées). Anneau de focus 2 px brand-600 (blanc dans la sidebar). Bordure des champs gray-500. Ajout de `.input-lg`, `.btn-lg`, `.btn-brand`, `.btn-danger-ghost`, `.kbd` | `tailwind.config.js`, `src/index.css` |
| 1.0 U24, U21, U6 | `paymentMeta.ts` : source unique (libellé « Espèces », icône, touche, classes, hex, ordre Espèces/Wave/OM). Remplace les 4 définitions codées en dur et `PAYMENT_LABEL`. Ajout de `PaymentBadge` (icône + libellé) | `paymentMeta.ts`, `PaymentBadge.tsx`, `HomeSections.tsx`, `RegistrationListParts.tsx`, `RegistrationTable.tsx`, `ActivityStats.tsx`, `Home.tsx`, `RegistrationList.tsx`, `ImportPreview.tsx`, `uiFormat.ts` |
| 1.1 U1 | Activité du guichet partagée avec l'accueil (clé `home.currentActivityId`, aucune migration). Priorité : `?activity=`, puis activité mémorisée, puis choix automatique de l'accueil. Barre « Inscription pour », montant habituel, badge « Événement passé », lien « Créer une activité » | `currentActivity.ts`, `ActivityBar.tsx`, `Home.tsx` |
| 1.2 U2, U3 | Plus de redirection : identité vidée, activité et date gardées, montant habituel et Espèces remis (D21), focus sur Nom. Bandeau `role="status"` avec « Modifier ». Pied : Effacer la saisie / Voir la liste / Enregistrer `Entrée`. Modification : retour à la saisie (`?retour=saisie`) ou à la liste de l'activité, avec le toast « Inscription modifiée. ». `autoFocus` sur Nom | `RegistrationForm.tsx`, `RegistrationFormParts.tsx`, `useFlashToast.ts`, `RegistrationList.tsx` |
| 1.3 | Panneau « Saisies de cette session » : 20 entrées en sessionStorage, total, une pastille par mode, 5 dernières lignes, « Modifier », « et N plus anciennes ». Réaligné sur la base à l'arrivée (inscription supprimée ou modifiée ailleurs). Noms et montants en `ink` (17:1, correction PM) | `SessionPanel.tsx`, `sessionEntries.ts`, `useSessionEntries.ts` |
| 1.4 U4, U5, U7 | Grille Nom/Prénoms, Téléphone/Adresse. Adresse en `input` d'une ligne, 200 caractères max. Date hors tabulation, avec « Changer la date » (affiche le champ et lui donne le focus, avertit si la date n'est pas aujourd'hui). Paiement : 3 vrais radios de 44 px, flèches natives, touches 1/2/3, Entrée enregistre. Montant en `text` + `inputMode=numeric`, suffixe F CFA, « 25 000 » à la sortie du champ, pas de molette. Focus sur le premier champ en erreur | `IdentityFields.tsx`, `PaymentSegment.tsx`, `RegistrationFormParts.tsx`, `registrationFormModel.ts` |
| 1.4 D22 | Ctrl+N (Cmd+N) / F2 : ouvre la saisie. Déjà sur la saisie : focus sur Nom, rien n'est effacé. `kbd` dans la sidebar | `shortcuts.ts`, `GlobalShortcuts.tsx`, `App.tsx` |
| 1.5 U8 | Autocomplétion : identifiants propres à chaque champ, `aria-activedescendant`, texte 14 px. Après le choix d'un contact : focus sur Paiement et ligne « Coordonnées reprises du carnet » | `ContactAutocomplete.tsx`, `IdentityFields.tsx` |
| 1.6 U9 | Doublon : « Créer quand même » passe en primaire. Le message donne l'activité, la date, le montant et le mode | `registrationFormModel.ts`, `RegistrationForm.tsx` |
| D19 | Adresse facultative au formulaire et à l'import (seule la règle « Adresse manquante » est retirée). Chaîne vide stockée, aucune migration. Préremplie par le carnet quand un contact est choisi | `registrationFormModel.ts`, `utils/importRegistrations.ts` (2 lignes) |
| D20, QA7-05 | Sauvegarder et Restaurer retirés de la Liste. Préférences > Sauvegardes : les deux actions (confirmation de restauration inchangée), l'emplacement copiable avec le mode d'emploi Windows + R, la liste des sauvegardes automatiques. Échap ne ferme plus les Préférences sous une confirmation ouverte | `BackupsSection.tsx`, `AutoBackupsSection.tsx`, `PreferencesModal.tsx`, `RegistrationList.tsx` |
| D22 | « Mesurer mes temps de saisie », désactivée par défaut : durée entre le premier caractère et l'enregistrement, en localStorage. Médiane, nombre de saisies, « Effacer les mesures ». Rien n'est transmis | `entryTiming.ts`, `useEntryTiming.ts`, `EntryTimingSection.tsx` |

## Gestes hors données, parcours de saisie
| Parcours | Avant (analyse du code, plan §1) | Après (mesuré) |
|---|---|---|
| 1 inscription, contact nouveau, Espèces, montant par défaut | 13 à 16 : 4 clics (menu, liste, option, Nom), 8 à 10 Tab dont 3 dans la date, 1 à 2 flèches, Entrée, puis 1,2 s d'attente et renvoi à la Liste | 3 : Tab, Tab, Entrée (adresse laissée vide) |
| Deux inscriptions enchaînées, même activité | 26 à 32, avec repassage par la sidebar et l'activité à rechoisir | **7** : Ctrl+N + 3 + 3, sans souris |
| Mode Wave ou Orange Money | 1 à 2 flèches de plus | 6 : Tab ×4, touche 2 ou 3, Entrée |
| Contact déjà dans le carnet | idem moins la frappe | 2 : Entrée (choix du contact), Entrée (enregistrer) |
Mesure : Chrome headless piloté en CDP avec de vrais événements clavier (script dans le scratchpad). Le focus est revenu sur Nom après chaque Entrée. La 2e inscription a demandé exactement 3 gestes. Couvert aussi par les tests de composant.

## Vérifications
- `npm test` : **11 fichiers, 198 tests verts** (169 existants + 29 nouveaux). Deux assertions existantes ont été adaptées à D19 (`frontModels.test.ts` : `address` retiré des champs requis ; `importRegistrations.test.ts` : « Adresse manquante » n'est plus attendu).
- Nouveaux tests : `lot1Models.test.ts` (19 : paymentMeta, session, chronométrage, raccourcis, activité du guichet, réinitialisation, montant, doublon). `RegistrationForm.lot1.test.tsx` (9 : préselection, enchaînement sans redirection, touches 1/2/3 + Entrée, focus sur l'erreur, Changer la date, contact du carnet, Ctrl+N/F2, retour de modification). `importRegistrations.test.ts` (+1 : adresse vide ou colonne absente).
- `npx tsc -p tsconfig.app.json --noEmit` : 0 erreur. `npm run lint` : 0 erreur, 0 avertissement.
- `VITE_DEMO_MODE=true npx vite build` : OK, 2202 modules, JS 1 259 Ko (387 Ko gzip), CSS 40 Ko. Avertissement de taille de chunk déjà présent avant.
- Garde ACL `tauriAcl.test.ts` respectée : aucune API Tauri nouvelle (voir écart 5).
- Mode démo : saisie, panneau, bandeau, liste, Préférences vérifiés en capture. Le serveur 5176 est arrêté.

## Captures (1366×768, mode démo)
Dossier `/private/tmp/claude-502/-Users-stephane-Documents-actio/ae03cc03-dae3-4424-a90c-1779c58a10b8/scratchpad/screens/` :
- avant : `lot1_avant_saisie.png`, `lot1_avant_liste.png` ;
- après : `lot1_apres_saisie_vide.png`, `lot1_apres_saisie_enregistree.png` (2 saisies, bandeau, panneau, focus sur Nom), `lot1_apres_liste.png` (sans Sauvegarder/Restaurer), `lot1_apres_preferences_sauvegardes.png`, `lot1_apres_preferences_mesure.png`, `lot1_apres_saisie_900x600.png`.

## Écarts au plan
1. Panneau à droite à partir de `xl` (1280 px) et non `lg` : à 1024 px, sidebar comprise, il ne reste que 768 px pour le formulaire et le panneau. 1366 est bien couvert.
2. 900×600 : le pied du formulaire déborde d'environ 40 px (barre du haut mobile, aide de Nom sur 2 lignes). À 1366×700, tout tient, bandeau compris.
3. Après « Mettre à jour » depuis la Liste, retour sur la liste de l'activité (`?activity=`). Les filtres ne sont pas gardés (U14, Lot 2).
4. Ctrl+N/F2 sont ignorés en modification (une correction en cours n'est pas perdue), sous une fenêtre modale et quand l'app est verrouillée.
5. Emplacement des sauvegardes : chemin statique `%APPDATA%\com.badstephane.gestion-inscription\backups` (variante macOS). L'API `path` aurait demandé d'élargir la garde ACL de QA. Ce chemin reprend l'identifiant de `tauri.conf.json` (inchangé selon D3).
6. Hors Lot 1, laissés en l'état : couleur marine de la sidebar et taille globale de `.btn` (Lot 3) ; libellé « Espèce » de l'export Excel et message d'erreur d'import dans `src/utils` (non autorisés).
7. D19 à l'import : l'adresse n'est pas reprise du carnet, car cela touche plus que la règle autorisée dans `importRegistrations.ts`.
8. Le panneau de session cumule toutes les activités de la session (caisse du guichet), sans filtre par activité.

**Avenant PM (remplace les écarts 6 à 8).** Le panneau de session n'affiche plus que l'activité du guichet (titre « Saisies de cette session · <activité> », plafond de 20 par activité, les saisies de l'autre activité reviennent quand on y retourne) : `sessionEntries.ts`, `SessionPanel.tsx`, `RegistrationForm.tsx`. Libellé « Espèces » dans `utils/excelExport.ts` et dans le message d'erreur et le modèle de `utils/importRegistrations.ts`. Valeurs reconnues à l'import inchangées (espèce, espece, espèces, especes, cash). 900×600 et adresse prise du carnet à l'import passent au Lot 2.
Vérifications après l'avenant : `npm test` 11 fichiers, **204 tests verts** (+2 modèles, +1 composant, +3 cas `parsePaymentType`, +1 assertion sur le libellé exporté) ; tsc 0 erreur ; lint propre ; build démo OK.
