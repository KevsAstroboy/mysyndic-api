## Context

MySyndic backend NestJS 10 + Prisma (SQL v3 inchangé). Sprint 1 livré : socle, auth, guards RBAC Redis + MustChangePassword, cite/villa/user/configuration, e2e 31/31. Le schéma contient déjà `paiement`, `recu_paiement`, `webhook` (avec `montant_match` generated) et les vues `v_impayes_mois_courant`, `v_recouvrement_mensuel`, `v_historique_paiements_villa`. La config par cité a les champs subaccount Paystack (change apply-ready).

## Goals / Non-Goals

**Goals**
- Initiation paiement Paystack → URL d'autorisation.
- Webhook sécurisé (HMAC), idempotent, montant vérifié, 200 immédiat, traitement async.
- Confirmation → `CONFIRME` + reçu PDF (PDFKit + QR) stocké MinIO + notification.
- Saisie manuelle multi-mois par syndic (features).
- Impayés, recouvrement, historique, export Excel.

**Non-Goals**
- Wave/Orange/MTN webhooks automatiques (canal manuel seulement).
- Module notification complet (sprint 4) — envoi inline simplifié au sprint 2.
- Refonte schéma SQL.

## Decisions

### D1. Rendre `paiement` gérable via service (pas générateur)
Le module paiement est trop métier pour le CRUD généré (typage state machine, validation villa/occupant, montant depuis config). Écrit à la main, comme auth.

### D2. Initiation Paystack
`POST /paiements/paystack/init` :
- Vérif occupant (user_villa is_current) + villa dans cité.
- Vérif pas déjà `CONFIRME` pour (villa,mois) → 409.
- Montant = `configuration.cotisation_mensuelle`.
- INSERT `paiement` (statut EN_ATTENTE/canal PAYSTACK, `reference_paystack = paiement.id`).
- Appel `https://api.paystack.co/transaction/initialize` avec `amount`, `email`, `reference`, `subaccount` (du subaccount_code de la config si présent).
- Retour `{ authorization_url, reference }`.
→ http client natif (fetch Node 22) ; pas de SDK (pas de bundling, maintenable).

### D3. Webhook générique + Paystack
- `POST /webhooks/paystack` (public, `@Public()`).
- Vérif `X-Paystack-Signature` : HMAC-SHA512(payload brut, `PAYSTACK_WEBHOOK_SECRET`). Les clés : app_config d'abord puis `.env` fallback.
- 200 immédiat après signature valide (avant traitement).
- Insertion `webhook` (aggregateur='PAYSTACK', reference, payload_requete JSON). `UNIQUE(aggregateur_code, reference)` = idempotence (P2002 → 200 silencieux).
- En async (fire-and-forget `setImmediate` / promise non-awaitée) : vérif payload.event (`charge.success`), montant_recu/montant_attendu, si `montant_match` → UPDATE paiement CONFIRME + INSERT recu_paiement + génération PDF asynchrone + notification + audit. Sinon webhook.erreur.
- `signature_ok=false` → 401 + INSERT webhook + stop (R4a).

### D4. Saisie manuelle
`POST /paiements/manuel` (feature `PAIEMENT_SAISIE_MANUELLE`) :
- DTO : villa_id, mois[] (1..N), montant, canal (WAVE_MANUEL/ORANGE_MANUEL/MTN_MANUEL/CASH), reference_externe?, preuve_url?, note?.
- `MULTI_MOIS_PAIEMENT_MAX` depuis app_config → 400 si dépassé.
- Transaction : INSERT N paiements (statut CONFIRME direct, canal manuel) + vérif doublon CONFIRME par mois.
- Reçu PDF pour chaque mois + notification.

### D5. PDF reçus
`PdfReceiptService` (PDFKit) : logo MySyndic, nom cité, numéro/rue villa, mois, montant, canal, référence, date confirmation, QR (lien `/verify/{qr_code_token}` via `qrcode` npm → embed image). Upload MinIO bucket `MINIO_BUCKET_DOCUMENTS`. `recu_paiement.file_path` = chemin.

### D6. Vues via `$queryRaw`
Les vues (`v_impayes_mois_courant`, `v_recouvrement_mensuel`, `v_historique_paiements_villa`) non introspectées par Prisma → requêtes typées `$queryRaw` avec scoping cite_id (`WHERE cite_id = ...`), mapping en typed DTO.

### D7. Export Excel
`exceljs` (streaming, colonnes : Villa, Mois, Montant, Canal, Statut, Date, Saisi Par). Feature `PAIEMENT_EXPORT_EXCEL`.

### D8. Récup du reçu API
`GET /paiements/:id/recu` → preuve PDF : si `recu_paiement` existe → URL signée MinIO (TTL 1h) ou stream ; sinon génération on-demand puis cache.

## Risks / Trade-offs

- **HMAC keys** : app_config + env fallback, log warning si absent. → secret de démo dans .env, prod via config DB gérée par SUPER_ADMIN.
- **Webhook async concurrency** : 2 requêtes même référence → UNIQUE DB repousse (P2002). Mais race entre la 1ère et la 2nde peut confirmer deux fois → vérifier statut déjà CONFIRME avant UPDATE (idempotence logique en plus de la contrainte).
- **PDF génération dans le webhook async** : peut échouer (MinIO down) → journaliser erreur, reçu générable on-demand (D8) = filet de sécurité.
- **Paiement test** : pas de clé Paystack réelle en dev → mock HTTP (NestTestingModule + overrideProvider d'un `PaystackClientService`) pour e2e.

## Migration Plan

1. `npm i pdfkit qrcode exceljs` + types.
2. `PaystackClientService` (initialize + vérif) mockable.
3. Module paiement (service + controller + vues raw), module webhook.
4. e2e : init (409 déjà confirmé), webhook (HMAC ok/ko, idempotent, montant mismatch), manuel, recu. Env : `PAYSTACK_WEBHOOK_SECRET` test fixe.
5. Rollback : aucun changement DB — désactiver module webhook suffit.

## Open Questions

- `MINIO_BUCKET_DOCUMENTS` vs `MINIO_BUCKET_MEDIA` : valeurs exactes dans app_config (seed en contient une) → lu et fallback 'mysyndic-documents'.
- Lien `/verify/{token}` frontend : hors scope API, seulement l'URL signée du PDF.