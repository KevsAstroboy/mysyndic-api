## Why

Le backend MySyndic a le socle + auth + modules d'administration (sprint 1 livré). La **feature coeur** du produit — la gestion des paiements de cotisation — n'existe pas encore. C'est le module financier critique : initiation Paystack, webhook sécurisé, reçus PDF, impayés/recouvrement.

## What Changes

- **Module paiement** : historique par villa (`v_historique_paiements_villa`), impayés mois courant (`v_impayes_mois_courant`), stats recouvrement (`v_recouvrement_mensuel`), initiation Paystack, saisie manuelle multi-mois, export Excel.
- **Module webhook** : endpoint unique `POST /webhooks/paystack` public, vérification signature HMAC-SHA512 (R4a), `montant_match` (R4b), idempotence `UNIQUE(aggregateur,reference)` (R4c), réponse 200 immédiate + traitement asynchrone (R4d).
- **PDF reçus** : PDFKit + QR code (`recu_paiement.file_path`, upload MinIO), contenu conforme spec (logo, cité, villa, mois, montant, canal, référence, date, QR).
- **Export Excel** : endpoint `GET /paiements/export` (feature `PAIEMENT_EXPORT_EXCEL`).
- **Paiement Paystack** : init → `authorization_url`, statut `EN_ATTENTE` → webhook confirme → `CONFIRME` + reçu + notifications.
- **Utilise** le schéma SQL v3 existant inchangé (paiement, recu_paiement, webhook, vues) et la config subaccount par cité (change `paystack-subaccounts-per-cite` apply-ready).
- Aucune breaking change.

## Capabilities

### New Capabilities

- `paiement-webhook` : initiation paiement Paystack, vérification du webhook (HMAC, montant, idempotence), confirmation asynchrone du paiement, reçus PDF, historique/impayés/recouvrement/export

### Modified Capabilities

## Impact

- **Code** : nouveau `src/modules/paiement/` + `src/modules/webhook/`, services partagés PDF/Excel, notifications in-app (module notification à créer en sprint 4 → notifications minimales inline au sprint 2).
- **DB** : aucun changement de schéma (SQL v3 inchangé). Vues existantes lues via Prisma `$queryRaw`.
- **Dépendances** : `pdfkit`, `qrcode`, `exceljs` (ou `xlsx`). Paystack via HTTP (fetch/axios) — pas de SDK.
- **Externalités** : Paystack API (initialize, verify), MinIO pour PDF, signature HMAC via `PAYSTACK_WEBHOOK_SECRET` depuis app_config/webhook secret env.