# Registre des risques

| # | Risque | Sévérité | Propriétaire | Échéance | Statut |
|---|---|---|---|---|---|
| R1 | Les migrations 10+ reconstruisent `registrations` sur des bases en service : une erreur = base illisible | Bloquant | Back | Avant tag | Mitigé par sauvegarde auto avant migration + test Rust sur bases v8 et v9 remplies |
| R2 | Des imports xlsx ONT été faits en prod (confirmé) : montants possiblement divisés par 1000, dates possiblement inversées | Bloquant | Back + Front (outil), opérateurs (revue) | Release 2.1.0 | Mitigé par `amount_review` + écran Contrôle des imports (D14) ; revue manuelle sur chaque poste |
| R3 | CSP stricte peut casser l'export xlsx ou des styles dans WebView2 | Majeur | Front / QA | Recette Windows | Ouvert |
| R4 | Première installation bloquée par SmartScreen (pas d'Authenticode) | Majeur | SRE / utilisateur (budget) | Prochaine release | Accepté provisoirement, procédure documentée |
| R5 | Mise à jour Windows de 196 Mo sur données mobiles | Majeur | SRE | Prochaine release | Accepté provisoirement |
| R6 | Base en clair : le verrou ne protège pas contre un accès au fichier | Majeur | PM | ADR D6 | Accepté (texte honnête + BitLocker) |
| R7 | Recette sur vrai poste Windows impossible depuis cet environnement (macOS) : sauvegarde, restauration, updater non exécutés de bout en bout | Majeur | QA / utilisateur | Avant tag | Ouvert : smoke manuel 10 min (docs/RELEASE.md) |
| R8 | QA7-01 : import CSV « 03/04/2026 » enregistré au 4 mars | Majeur | Back | Avant tag 2.1.0 | En correction (D17) |
| R9 | Smoke test Windows (12 parcours, 07-qa.md §5) non exécuté : CSP WebView2, restauration réelle, rename après fermeture du pool, updater | Bloquant pour le tag | Utilisateur (exécution et signature) | Avant publication 2.1.0 | Ouvert |
