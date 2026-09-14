## 1. Dépendances & services partagés

- [x] 1.1 `npm i pdfkit qrcode exceljs` + `@types/pdfkit` (dev), vérifier build
- [x] 1.2 Créer `src/modules/paiement/paystack-client.service.ts` : `initializePayment({amount,email,reference,subaccount})` + `verifyTransaction(ref)` via fetch, résolvable depuis PaystackClientService (mockable e2e)
- [x] 1.3 Créer `src/modules/paiement/pdf-receipt.service.ts` (PDFKit) : `generateReceipt(data)` → Buffer PDF (logo, cité, villa, mois, montant, canal, référence, date, QR via qrcode → buffer PNG embarqué)
- [x] 1.4 Créer `src/modules/paiement/excel-export.service.ts` (exceljs) : `exportPaiements(rows)` → workbook buffer

## 2. Module Paiement

- [x] 2.1 DTOs : `InitPaystackDto` (villa_id `@IsFlexibleUuid`, mois `@Matches(/^\d{4}-(0[1-9]|1[0-2])$/)`), `PaiementManuelDto` (villa_id, mois[] 1..N, montant≥1, canal enum, ref/prête/note optionnels), `PaiementRechercheDto` (mois, statut, canal, villa, pagination)
- [x] 2.2 `paiement.service.ts` : `initPaystack` (occupant check → 403, déjà CONFIRME → 409, montant config → 400, INSERT EN_ATTENTE, call Paystack, return url)
- [x] 2.3 `paiement.service.ts` : `saisieManuelle` (validations, transaction N INSERT CONFIRME + reçus + audit, MULTI_MOIS_PAIEMENT_MAX)
- [x] 2.4 Vues raw (scoped cite_id) : `historiqueVilla(villaId)`, `impayesMoisCourant()`, `recouvrementMensuel()` via `$queryRaw` typé
- [x] 2.5 Reçu API : `getRecu(id)` → recu_paiement existant → URL signée MinIO (TTL 1h) sinon génération on-demand + upload + return
- [x] 2.6 Export : `exportExcel(citeId, filtres)` → buffer + stream réponse
- [x] 2.7 `paiement.controller.ts` : routes (historique villa, impayés, recouvrement, init paystack, manuel, recu, export), guards features (`PAIEMENT_READ_OWN`/`PAIEMENT_READ_ALL`/`PAYSTACK`/`PAIEMENT_SAISIE_MANUELLE`/`PAIEMENT_EXPORT_EXCEL`)

## 3. Module Webhook

- [x] 3.1 `webhook.service.ts` : `storePayload(dto)` (INSERT webhook, P2002 → swallow idempotent), `processPaystack(payload)` async
- [x] 3.2 HMAC : helper `verifyHmacSignature(rawBody, signature, secret)` SHA512 ; secret résolu app_config → `.env` fallback
- [x] 3.3 `processPaystack` : event charge.success, montant_recu=amount/100, montant_attendu=paiement.montant, si confirmé skip ; UPDATE paiement CONFIRME + recu_paiement (token qr unique) + PDF upload async + notif inhabitants + audit + webhook.traite=true
- [x] 3.4 `webhook.controller.ts` : `POST /webhooks/paystack` `@Public()`, sign KO → 401, OK → 200 immédiat + setImmediate(async process)

## 4. Notifications (inline minimal)

- [x] 4.1 Helper `sendNotif(prisma, {cite_id, user_id, titre, message})` : INSERT notification (reuse schema) — module notification complet sprint 4
- [x] 4.2 Brancher sur confirmation webhook + saisie manuelle + init

## 5. Enregistrement modules & config

- [x] 5.1 `PaiementModule` + `WebhookModule` dans app.module.ts
- [x] 5.2 WebhookGuard/public : vérifier que `@Public()` (MustChangePasswordGuard) ne bloque pas POST /webhooks/paystack
- [x] 5.3 Vérifier valeur buckets app_config (MINIO_BUCKET_DOCUMENTS) + fallback constant

## 6. Tests e2e

- [x] 6.1 Fixture e2e : seed villa+configuration cotisation, user habitant occupant, activate PaystackClientService mock
- [x] 6.2 e2e init : 200 url (mock), 403 non-occupant, 409 mois confirmé, 400 config sans montant
- [x] 6.3 e2e webhook : signature KO → 401 + webhook signature_ok=false ; happy path → paiement CONFIRME (mock prisma update) ; idempotence 2x → 200 sans double ; montant mismatch → montant_match=false
- [x] 6.4 e2e manuel : succès multi-mois, >max → 400, mois confirmé → 400
- [x] 6.5 e2e recu : test 404 (paiement inconnu) couvert ; happy path URL signée dépend MinIO up (MinIO down en CI → génération catchée ; testé via mock serveur dev)
- [x] 6.6 Build (nest build) + suite complète verte (31 préexistants + nouveaux)

## 7. Documentation & OpenSpec

- [x] 7.1 Mettre à jour `.env.example` (PAYSTACK_WEBHOOK_SECRET) si absent
- [x] 7.2 Cocher tasks.md + statut apply-ready
