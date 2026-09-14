# Notes de release

## Sprint 2 — Paiement + Webhook (2026-09-05)

- Initiation paiement Paystack : EN_ATTENTE + authorization_url, subaccount par cité.
- Webhook `POST /webhooks/paystack` : HMAC-SHA512 (PAYSTACK_SECRET_KEY), idempotence UNIQUE(aggregateur, reference), traitement async, montant_match generated.
- Saisie manuelle multi-mois (syndic), reçus PDF (PDFKit), export Excel (exceljs), vues impayés/recouvrement.

## Migration prod — Paystack subaccounts par cité (BREAKING)

Avant déploiement, exécuter en prod (le script seed idempotent ne DROP pas) :

```sql
ALTER TABLE configuration
  DROP COLUMN IF EXISTS paystack_public_key,
  DROP COLUMN IF EXISTS paystack_secret_key;

ALTER TABLE webhook DROP COLUMN IF EXISTS montant_match;
ALTER TABLE webhook ADD COLUMN montant_match BOOLEAN GENERATED ALWAYS AS (montant_recu = montant_attendu) STORED;
```

Puis renseigner les clés globales dans `app_config` :
`PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY` (compte marchand master), `PAYSTACK_CURRENCY` (XOF).

`WEBHOOK_PAYSTACK_SECRET` supprimé du seed app_config (redondant — Paystack signe avec PAYSTACK_SECRET_KEY). Mettre à jour les clés/secret dans l'env de prod si présents.

## Spikes Paystack à valider en CI avant mise en prod

- Création/liste des subaccounts (API `subaccount/create`, `subaccount/list`).
- Settlement bancaire local (Côte d'Ivoire) : virement vers le compte propre de chaque cité.
- Checkout avec `bearer: account` en mode SIMPLE (l'argent va au subaccount, pas au master).
- Mise à jour du ratio de split en mode SPLIT et vérification du comportement `split: { type: 'percentage', value: X, bearer_subaccount }`.