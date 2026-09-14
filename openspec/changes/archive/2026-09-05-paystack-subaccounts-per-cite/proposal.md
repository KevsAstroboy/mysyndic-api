## Why

Chaque cité doit encaisser ses cotisations sur SON compte bancaire sans que le syndic ait jamais à ouvrir Paystack (reversement technique non réalisable par eux). MySyndic passe en compte marchand Paystack master avec un subaccount par cité : la séparation automatique de l'argent se fait à la charge. En parallèle, la config des clés paystack doit être globalisée et le webhook doit fiabiliser la vérification du montant reçu.

## What Changes

- **BREAKING** `configuration` : retirer `paystack_public_key` et `paystack_secret_key` (déplacées dans `app_config` global)
- `configuration` : ajouter `paystack_subaccount_code`, `paystack_subaccount_mode` (`SIMPLE`/`SPLIT`), `paystack_subaccount_split` (pct syndic, défaut 100), tous réservés SUPER_ADMIN
- `app_config` : ajouter clés globales `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_CURRENCY` (=`XOF`)
- `app_config` : retirer `WEBHOOK_PAYSTACK_SECRET` (redondant — Paystack signe les webhooks avec `PAYSTACK_SECRET_KEY`, pas de secret séparé)
- `webhook` : `montant_match` devient generated column (calculé depuis `montant_attendu`/`montant_recu`, jamais incohérent)
- Flow checkout : `SIMPLE` → `subaccount` + `bearer: account` ; `SPLIT` → split avec ratio par cité
- Reçu PDF : `recu_paiement` reste source de vérité unique (déjà appliqué — rappel dans tasks)

## Capabilities

### New Capabilities
- `paystack-subaccounts`: subaccount par cité, gestion par SUPER_ADMIN, mode/split par cité, checkout init

### Modified Capabilities
<!-- Aucune spec existante — specs maintenues côté source; delta en dur -->

## Impact

- `init-scripts/mysyndic_db.sql` : DDL `configuration`, `app_config`, `webhook` (generated column), seeds
- Service paiement : `initialize` Paystack (subaccount/mode/split), lecture app_config globale
- Service webhook : vérification HMAC via `PAYSTACK_SECRET_KEY`, écriture `montant_attendu`/`montant_recu`
- RBAC : features nouvelles (`SA_MANAGE_SUBACCOUNT`, `CONFIG_CITE_UPDATE`) à figer — différé (modèle non figé)
- Migration prod : drop colonnes `paystack_*` et `montant_match` à planifier (script idempotent ne drop pas)