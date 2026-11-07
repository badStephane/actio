# 03 - Contrat interne pour les correctifs de l'audit

Actio n'a pas d'API HTTP : le « contrat » est l'interface entre la couche données (`src/utils/*`, `src-tauri/*`,
propriété **Back**) et les écrans (`src/components/*`, `src/pages/*`, `src/App.tsx`, `src/main.tsx`, propriété **Front**).
Back et Front travaillent en parallèle contre ce document. Toute divergence se signale dans le retour, elle ne
s'improvise pas.

Base de code : branche `audit/pre-prod` (fusion de `main` + tag `v2.0.2`). Migrations existantes : 1 à 9
(9 = `contacts`). **Les nouvelles migrations commencent à 10.**

## Propriété des fichiers (aucun agent n'édite un fichier de l'autre)

| Propriétaire | Fichiers |
|---|---|
| Back | `src-tauri/**` (lib.rs, Cargo.toml, capabilities, tauri.conf.json), `src/utils/**` (y compris `demo.ts`, `contacts.ts`), `src/types/**`, `package.json` / `package-lock.json` |
| Front | `src/components/**`, `src/pages/**`, `src/App.tsx`, `src/main.tsx`, `src/index.css`, `index.html` |
| SRE | `.github/**`, `vercel.json`, `scripts/**`, `docs/squad/06-ops.md`, `docs/RELEASE.md` |
| QA (après les trois autres) | `src/**/*.test.ts(x)`, `vitest.config.ts`, `src-tauri/tests/**`, `docs/squad/07-qa.md`, ajout de devDeps |

## Fonctions exposées par le Back (signatures figées)

### `src/utils/amount.ts` (nouveau, pur)
```ts
/** Entier XOF >= 0. Accepte number entier, ou chaîne avec espaces / espaces insécables / « F » / « FCFA ».
 *  Refuse décimales, séparateurs ambigus (« 5,000 », « 5.000 »), négatifs, NaN. */
export const parseAmountXof = (input: unknown): number | null;
export const MAX_AMOUNT_XOF = 100_000_000;
```

### `src/utils/dates.ts` (nouveau, pur)
```ts
export const todayLocalIso = (now?: Date): string;          // 'AAAA-MM-JJ' en heure locale
export const isValidIsoDate = (s: string): boolean;          // rejette 2026-02-30, 2025-02-29
```

### `src/utils/auth.ts`
```ts
export const MIN_PASSWORD_LENGTH = 8;                        // nouveaux mots de passe seulement
export type VerifyResult = { ok: true } | { ok: false; retryAfterMs: number; attemptsLeft?: number };
export const hasPassword: () => Promise<boolean>;            // lève une erreur si la base est illisible (jamais false par défaut)
export const createInitialPassword: (pw: string) => Promise<void>;   // échoue si un mot de passe existe déjà
export const updatePassword: (pw: string) => Promise<void>;          // UPDATE, préserve recovery_*
export const verifyPassword: (pw: string) => Promise<VerifyResult>;  // compteur d'échecs persistant + backoff
export const hasRecoveryCode: () => Promise<boolean>;
export const generateRecoveryCode: () => Promise<string>;    // code généré (≥ 80 bits, ex. « ABCD-EFGH-JKLM-NPQR »), stocké haché, renvoyé UNE fois
export const verifyRecoveryCode: (code: string) => Promise<VerifyResult>; // normalise (trim, majuscules, tirets) ; en cas de succès le code est CONSOMMÉ (D2)
export const clearRecoveryCode: () => Promise<void>;
```
`setPassword` et `resetAuthAndData` disparaissent. `setRecoveryCode` (code choisi par l'utilisateur) disparaît.

### `src/utils/dbBackup.ts` (s'appuie sur des commandes Rust)
```ts
export const exportDatabase: () => Promise<boolean>;   // false = annulé ; instantané cohérent (VACUUM INTO)
export const restoreDatabase: () => Promise<boolean>;  // false = annulé ; lève Error(message FR) si fichier invalide ;
                                                       // succès = sauvegarde auto de l'existant + remplacement + REDÉMARRAGE de l'app
export const resetAppData: () => Promise<void>;        // sauvegarde auto, purge (inscriptions, contacts, audit, activités sauf défaut, auth), redémarrage
export const listAutoBackups: () => Promise<{ name: string; createdAt: number; sizeBytes: number }[]>;
export const BACKUP_DIR_LABEL: string;                 // texte à afficher, ex. « dossier de l'application / backups »
```
`importDatabase` est renommée `restoreDatabase`.

### `src/utils/importRegistrations.ts`
Le résultat d'analyse gagne :
```ts
missingColumns: Array<'amount' | 'paymentType' | 'registrationDate'>; // colonnes attendues absentes → le Front exige une confirmation explicite
unrecognizedHeaders: string[];
totalAmount: number;                                                   // somme des montants lus, affichée dans l'aperçu
```
Chaque ligne prévisualisée expose son montant lu (`amount: number`) et ses erreurs (`errors: string[]`).
L'import complet est **atomique** (tout ou rien).

### `src/utils/activities.ts`
`deleteActivity(id)` lève `Error('Cette activité a encore des inscriptions : archivez-la plutôt.')` si des
inscriptions la référencent (clé étrangère côté base).
`countRegistrationsByActivity(): Promise<Record<string, number>>` (une requête `GROUP BY`) remplace la boucle N+1.

### `src/utils/audit.ts`
Nouveaux types d'événements visibles dans l'écran Historique : `imported`, `restored`, `backup_exported`,
`reset`, `password_changed`, `recovery_used`, `audit_cleared` ; entité `system`. `clearAuditLog` laisse un
événement `audit_cleared`. Le Front doit afficher un libellé pour chacun.

### Mode démo
`contacts.ts` gère `DEMO_MODE` comme `storage.ts` (données fictives en mémoire). `dbBackup.ts` lève
`Error('Indisponible en mode démonstration.')`.

## Ce que le Front doit faire avec ce contrat
- Toutes les erreurs de ces fonctions s'affichent (toast `role="alert"` ou panneau), jamais en `console.error` seul.
- `verifyPassword` / `verifyRecoveryCode` : afficher l'attente (`retryAfterMs`) et désactiver la saisie pendant ce temps.
- Après `verifyRecoveryCode` ok : forcer « nouveau mot de passe » (`updatePassword`), puis afficher un nouveau code (`generateRecoveryCode`) une seule fois avec « je l'ai noté ».
- `restoreDatabase` / `resetAppData` : confirmation qui dit ce qui est remplacé (y compris le mot de passe) et où est la sauvegarde automatique ; « Tout effacer » exige la saisie du mot `EFFACER`.

## Avenant A1 - Contrôle des imports déjà faits en prod (R2 confirmé par l'utilisateur)

Des imports xlsx ont déjà eu lieu sur des postes en service : des montants ont pu être divisés par 1000
(« 5,000 » → 5, « 1,500 » → 1.5) et des dates inversées jour/mois. On ne corrige PAS automatiquement
(ambigu) : on préserve la preuve et on fait revoir par l'opérateur.

### Back
- La migration qui convertit `amount` en INTEGER **ne doit pas perdre l'information** : avant conversion, copier
  dans une table `amount_review (registration_id TEXT PRIMARY KEY, original_amount REAL NOT NULL, reason TEXT NOT NULL,
  reviewed_at INTEGER)` toute ligne dont l'ancien montant n'est pas entier (`amount != CAST(amount AS INTEGER)`),
  avec `reason = 'non_integer'`. Pour ces lignes, montant converti = `CAST(ROUND(amount * 1000) AS INTEGER)` SI
  `amount < 1000` (séparateur de milliers lu comme décimale), sinon `ROUND(amount)` ; la valeur d'origine reste
  dans `amount_review`.
- `src/utils/importReview.ts` :
```ts
export type SuspicionReason = 'non_integer' | 'amount_too_small' | 'date_ambiguous';
export interface SuspiciousRegistration {
  registration: Registration; reasons: SuspicionReason[];
  originalAmount?: number; suggestedAmount?: number; suggestedDate?: string; batchSize: number;
}
export const findSuspiciousRegistrations: () => Promise<SuspiciousRegistration[]>;
export const markReviewed: (registrationId: string) => Promise<void>;      // pose reviewed_at, journalisé
```
  Heuristique : lignes « importées » = groupe d'au moins 3 inscriptions d'une même activité dont `created_at`
  tombe dans la même seconde. `amount_too_small` : importée, `0 < amount < 1000` et (montant par défaut de l'activité
  ≥ 1000 ou médiane du lot ≥ 1000) → `suggestedAmount = amount * 1000`. `date_ambiguous` : importée, jour ≤ 12, mois ≤ 12,
  jour ≠ mois → `suggestedDate` = date avec jour et mois inversés. Lignes déjà `reviewed_at` exclues. Mode démo :
  liste vide. La correction elle-même passe par `updateRegistration` existant (journalisé).

### Front
- Écran ou modale « Contrôle des imports » (accessible depuis Préférences et via un bandeau sur l'accueil quand la
  liste n'est pas vide) : tableau des inscriptions suspectes, raison en clair, valeur actuelle / valeur suggérée,
  actions « Appliquer la suggestion » (via `updateRegistration`) et « C'est correct » (`markReviewed`). Pas de
  correction en masse sans confirmation.
