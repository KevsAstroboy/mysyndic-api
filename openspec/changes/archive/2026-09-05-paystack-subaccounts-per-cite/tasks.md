## 1. app_config — clés Paystack globales

- [x] 1.1 Ajouter au seed `app_config` les clés `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY` (vides, module PAIEMENT) et `PAYSTACK_CURRENCY` (`XOF`)
- [x] 1.2 Supprimer l'entrée `WEBHOOK_PAYSTACK_SECRET` du seed `app_config`
- [x] 1.3 Conserver `WEBHOOK_WAVE_SECRET` (distinct, pour Wave V2)

## 2. configuration — subaccount par cité

- [x] 2.1 Retirer `paystack_public_key` et `paystack_secret_key` de la DDL `configuration`
- [x] 2.2 Ajouter `paystack_subaccount_code VARCHAR(255)` à `configuration`
- [x] 2.3 Ajouter `paystack_subaccount_mode VARCHAR(10) DEFAULT 'SIMPLE'` + contrainte `ck_subaccount_mode IN ('SIMPLE','SPLIT')`
- [x] 2.4 Ajouter `paystack_subaccount_split INT4 DEFAULT 100` + contrainte `ck_subaccount_split BETWEEN 1 AND 100`
- [x] 2.5 Mettre à jour le seed `configuration` de Synacassy 1 (retirer les 2 clés paystack de l'INSERT)
- [x] 2.6 Mettre à jour le commentaire de version v3 (en-tête) pour refléter les champs subaccount

## 3. webhook — generated column montant_match

- [x] 3.1 Remplacer `montant_match BOOLEAN DEFAULT FALSE` par generated column STORED (calculée depuis `montant_attendu`/`montant_recu`)
- [x] 3.2 Vérifier qu'aucun INSERT seed n'écrit `montant_match` explicitement
- [x] 3.3 `montant_recu`/`montant_attendu` restent des colonnes normales (écrites par le service)

## 4. Vérifications & cohérence globale

- [x] 4.1 Confirmer `recu_paiement` source de vérité unique du reçu (déjà appliqué — non-régression)
- [x] 4.2 Re-exécuter le script SQL en base de test vide : aucune erreur (idempotent)
- [x] 4.3 Documenter la migration prod (drop colonnes `paystack_*` / recréation `montant_match` generated) dans les notes de release
- [x] 4.4 Noter les spikes Paystack CI à valider avant mise en prod : subaccounts + settlement bancaire local + `bearer: account` + split update