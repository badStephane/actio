# 00 - Contexte partagé : audit avant prod d'Actio

## Demande
Audit complet avant mise en production (mode Revue multi-métiers), puis correctifs.
Périmètre : sécurité, intégrité des données, front (états, accessibilité), release / updater / CI, tests.
Livrable final : verdict, hypothèses, tableau `Constat | Rôle | Sévérité | Correction`, top 3, correctifs.

Sévérités : **Bloquant** = perte d'argent ou de données, faille exploitable, parcours principal cassé ;
**Majeur** = défaut sérieux avec contournement, ou bombe à retardement ; **Mineur** = qualité, confort.

## Produit
Actio : application **desktop** de gestion des inscriptions à des activités (associations, formations,
événements, terrain Afrique de l'Ouest). 100 % locale, sans serveur. Un seul poste, un seul opérateur.
Fonctions : inscriptions (nom, prénom, téléphone, adresse, date, paiement wave / cash / orange_money, montant,
activité), activités (archivage), statistiques (recharts), export Excel (xlsx), import d'inscriptions,
journal d'audit, verrouillage par mot de passe + code de récupération, sauvegarde / restauration du fichier
`.db`, mise à jour automatique, préférences, mode démo web (Vercel, `VITE_DEMO_MODE=true`, données fictives).

## Stack
- Shell : Tauri 2 (Rust), `src-tauri/src/lib.rs` (migrations SQL 1 à 8 en dur), `tauri.conf.json`,
  `capabilities/default.json`.
- Front : React 18 + Vite 6 + TypeScript, React Router 6, Tailwind 3, lucide-react, recharts 3, xlsx 0.18.5.
- Données : SQLite via `@tauri-apps/plugin-sql` (`sqlite:inscriptions.db` dans APPDATA). Toute la logique
  d'accès est côté front (`src/utils/*.ts`), pas de commande Rust métier.
- Auth : PBKDF2-SHA256 100k itérations via WebCrypto (`src/utils/auth.ts`), hash en base.
- CI : `.github/workflows/build.yml` : build Windows (msi + nsis) et macOS universel sur push main et tag `v*`,
  signature updater minisign, publication `latest.json` sur la release GitHub.
- Updater : endpoint `https://github.com/badStephane/Gestion_Inscription/releases/latest/download/latest.json`.
- Aucun test automatisé, aucun runner de test installé. `npm run lint` existe (ESLint 9) mais n'est pas en CI.

## Carte du code (lignes)
- Pages : `src/pages/Home.tsx` (533), `Activities.tsx` (336), `ActivityStats.tsx` (309), `Audit.tsx` (225)
- Composants : `RegistrationList.tsx` (825), `RegistrationForm.tsx` (457), `AuthGate.tsx` (375),
  `ImportRegistrationsModal.tsx` (354), `ActivityFormModal.tsx`, `RecoveryUnlockModal.tsx`,
  `RecoveryCodeModal.tsx`, `ChangePasswordModal.tsx`, `ConfirmModal.tsx`, `UpdateChecker.tsx`,
  `PreferencesModal.tsx`, `Toast.tsx`, `DemoBanner.tsx`
- Utils : `storage.ts` (inscriptions), `activities.ts`, `audit.ts`, `auth.ts`, `db.ts`, `dbBackup.ts`,
  `importRegistrations.ts`, `excelExport.ts`, `demo.ts`
- App : `src/App.tsx` (routes, layout)

## Hypothèses
- H1 : distribution principale Windows (msi / exe) ; macOS secondaire.
- H2 : un seul utilisateur par poste ; la menace réaliste est un tiers ayant accès physique au poste ou un
  fichier `.db` / `.xlsx` malveillant ou corrompu, pas un attaquant réseau.
- H3 : les montants sont en francs CFA (entiers), pas de paiement en ligne réel : `wave` / `orange_money`
  sont des modes déclaratifs saisis à la main.
- H4 : des installations sont déjà en service ; toute migration doit préserver les données existantes et
  l'identifiant d'app / l'endpoint updater ne doivent pas casser la mise à jour des postes installés.
- H5 : l'app a été renommée « Actio » côté UI (commit 3a36368) mais `productName` reste « Gestion des
  Inscriptions » : à juger sans casser H4.

## Contraintes pour les correctifs
- Pas de changement d'`identifier` Tauri (casserait APPDATA et l'updater sur les postes installés).
- Migrations : uniquement ajoutées (version 9+), jamais modifier les versions 1 à 8 déjà appliquées.
- Respecter le style existant (TS, fonctions fléchées, Tailwind, textes UI en français).
- Pas de push, pas de release, pas de tag.
