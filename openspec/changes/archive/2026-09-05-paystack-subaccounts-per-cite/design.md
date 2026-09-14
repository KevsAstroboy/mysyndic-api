## Context

MySyndic multitenant laisse aujourd'hui chaque syndic gérer ses cotisations manuellement. Les clés Paystack sont par-cité dans `configuration` (paire public/secret dupliquée par cité), et la table `webhook` porte un `montant_match BOOLEAN` écrit par le code. Le syndic ne peut pas faire de reversement via le dashboard Paystack (trop technique) : il faut que l'argent arrive directement sur sa banque.

Modèle retenu : **un compte marchand master MySyndic + un subaccount par cité**, split automatique à la charge. Zéro reversement manuel, une seule paire de clés globale.

Script cible : `init-scripts/mysyndic_db.sql` (idempotent, PostgreSQL 16). Rien dans le repo au-delà du SQL et des docs design.

## Goals / Non-Goals

**Goals:**
- Globaliser les clés Paystack dans `app_config`
- Par-cité : `paystack_subaccount_code`, `paystack_subaccount_mode`, `paystack_subaccount_split`
- `webhook.montant_match` calculé par Postgres (generated column)
- Supprimer `WEBHOOK_PAYSTACK_SECRET` redondant
- Rester idempotent / réexécutable sans erreur

**Non-Goals:**
- RBAC : features `SA_MANAGE_SUBACCOUNT` / `CONFIG_CITE_UPDATE` + bump version → **différé** (modèle en cours de figement)
- Endpoints API `/admin/subaccounts` → différés avec le RBAC
- Migration de données prod (drop colonnes existantes)
- Intégration réelle aux API Paystack

## Decisions

### D1 — Subaccount paystack par cité (Option 1)
Chaque cité encaisse sur sa banque via subaccount. MySyndic = master, 1 paire de clés.
- `configuration` perd `paystack_public_key`/`paystack_secret_key`
- `app_config` gagne `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY`, `PAYSTACK_CURRENCY=XOF`
- `configuration` gagne 3 champs réservés SA :
  ```sql
  paystack_subaccount_code   VARCHAR(255),
  paystack_subaccount_mode   VARCHAR(10)  DEFAULT 'SIMPLE',
  paystack_subaccount_split  INT4         DEFAULT 100,
  CONSTRAINT ck_subaccount_mode  CHECK (paystack_subaccount_mode  IN ('SIMPLE','SPLIT')),
  CONSTRAINT ck_subaccount_split CHECK (paystack_subaccount_split BETWEEN 1 AND 100)
  ```
- Ratio = part qui va au syndic (100 = tout syndic). Modifiable via API Paystack sans recréer le subaccount ; appliqué aux futurs paiements.

**Alternatives écartées :** compte marchand par cité (syndic devrait gérer Paystack), plateforme encaisse + reverse central (float + ops legales).

### D2 — Checkout SIMPLE vs SPLIT
- `SIMPLE` → `subaccount: <code>` + `bearer: account` (frais payés par MySyndic, syndic reçoit le net nominal)
- `SPLIT` → split avec `percentage = paystack_subaccount_split` de la cité
- Mode et ratio sont lus au moment de `initialize` depuis `configuration` par `cite_id`.

### D3 — `WEBHOOK_PAYSTACK_SECRET` supprimé
Paystack n'a pas de secret webhook séparé : la signature HMAC utilise `PAYSTACK_SECRET_KEY` (même clé que les appels API). `WEBHOOK_WAVE_SECRET` est conservé (secret réel et distinct, pour Wave V2).

### D4 — `montant_match` generated column
```sql
montant_match BOOLEAN GENERATED ALWAYS AS
  (montant_recu IS NOT NULL AND montant_attendu IS NOT NULL
   AND montant_recu = montant_attendu) STORED
```
- TRUE = égaux, FALSE = différents, NULL = incomparable (réf orpheline)
- Retirer le `BOOLEAN DEFAULT FALSE` et toute écriture explicite dans les seeds.
- `montant_attendu` rempli au callback via `paiement.reference_paystack`, `montant_recu` = `amount` du payload.

## Risks / Trade-offs

- [Script idempotent ne drop pas : `montant_match` reste colonne normale si déjà déployé] → Migration prod dédiée ; documenter dans `Migration Plan`.
- [Support Paystack CI des subaccounts + settlement bancaire local + `bearer: account` non vérifié] → Spikes avant mise en prod (§ Open Questions).
- [`montant_match` NULL pour réf orpheline] → Sémantique assumée ; filtrer `montant_match = FALSE` (pas `IS NOT TRUE`) pour fraud3 detection.
- [Suppression clés par-cité = **BREAKING** pour les cités existantes déjà reliées à Paystack] → Nouveau subaccount à créer ; clés master uniques à provisionner.

## Migration Plan

1. Appliquer les edits DDL sur `init-scripts/mysyndic_db.sql` (idempotent — réexécutable en dev)
2. Pour prod, migration ciblée :
   - `ALTER TABLE configuration DROP COLUMN` des 2 clés + ajout des 3 champs avec defaults
   - `ALTER TABLE webhook ALTER COLUMN montant_match DROP DEFAULT` puis remplacer par generated (recréer colonne)
   - `DELETE FROM app_config WHERE "key" = 'WEBHOOK_PAYSTACK_SECRET'`
3. Rollback : re-ajouter colonnes clés par-cité avec re-seed des valeurs précédentes (saved avant drop)

## Open Questions

- Paystack CI expose-t-il les subaccounts + settlement banque locale ? (`bearer: account` ?)
- Endpoint de split update confirmé sur la version CI ?
- Le pattern d'unique (cite_id) de `configuration` reste adapté aux 3 champs SA ? (Oui — 1 ligne par cité)
- RBAC : timing du figement des features `SA_MANAGE_SUBACCOUNT` / `CONFIG_CITE_UPDATE`