# paystack-subaccounts

## Purpose

Subaccount Paystack par cité : chaque cité encaisse sur son propre compte à la charge, le compte marchand master étant détenu par MySyndic. Clés Paystack globalisées dans `app_config`, modes SIMPLE/SPLIT par cité, vérification HMAC basée sur `PAYSTACK_SECRET_KEY` et `montant_match` calculé par PostgreSQL.

## Requirements

### Requirement: Subaccount Paystack par cité
La table `configuration` SHALL stocker pour chaque cité l'identifiant du subaccount Paystack (`paystack_subaccount_code`), le mode de règlement (`paystack_subaccount_mode`) et le pourcentage dédié au syndic (`paystack_subaccount_split`). Ces trois champs SHALL être réservés à l'action du SUPER_ADMIN. Aucune ligne de cité ne SHALL exister sans valeur de mode valide (`SIMPLE` ou `SPLIT`) et sans un split compris entre 1 et 100.

#### Scenario: Création du subaccount pour une cité
- **WHEN** le SUPER_ADMIN crée un subaccount Paystack pour une cité
- **THEN** le `paystack_subaccount_code` reçu est stocké dans `configuration` de cette cité
- **AND** le `paystack_subaccount_mode` vaut par défaut `SIMPLE`
- **AND** le `paystack_subaccount_split` vaut par défaut `100`

#### Scenario: Mode invalide rejeté
- **WHEN** une tentative d'écriture affecte `paystack_subaccount_mode` avec une valeur hors `SIMPLE`/`SPLIT`
- **THEN** la contrainte `ck_subaccount_mode` rejette l'écriture

#### Scenario: Split hors bornes rejeté
- **WHEN** une tentative d'écriture affecte `paystack_subaccount_split` hors de l'intervalle 1-100
- **THEN** la contrainte `ck_subaccount_split` rejette l'écriture

### Requirement: Clés Paystack globales
`app_config` SHALL héberger les clés master du compte marchand : `PAYSTACK_PUBLIC_KEY`, `PAYSTACK_SECRET_KEY` et `PAYSTACK_CURRENCY`. `configuration` SHALL ne plus contenir `paystack_public_key` ni `paystack_secret_key`. Le secret webhook `WEBHOOK_PAYSTACK_SECRET` SHALL être supprimé car redondant avec `PAYSTACK_SECRET_KEY`.

#### Scenario: Checkout initialisé
- **WHEN** un résident initie un paiement Paystack
- **THEN** le service lit `PAYSTACK_PUBLIC_KEY` dans `app_config` pour initialiser le checkout
- **AND** le montant attendu provient de `configuration.cotisation_mensuelle` de la cité

#### Scenario: Signature webhook vérifiée
- **WHEN** un webhook Paystack arrive
- **THEN** le service vérifie `x-paystack-signature` en HMAC-SHA512 avec `PAYSTACK_SECRET_KEY`
- **AND** aucun secret webhook séparé n'est requis

### Requirement: Mode SIMPLE — subaccount plein
Dans le mode `SIMPLE`, le checkout Paystack SHALL être initialisé avec le `paystack_subaccount_code` de la cité et `bearer: account`, de sorte que le syndic reçoive le montant nominal net des frais réglés par MySyndic.

#### Scenario: Paiement en mode SIMPLE
- **WHEN** la cité du payeur a `paystack_subaccount_mode = 'SIMPLE'`
- **THEN** l'appel `initialize` Paystack passe `subaccount = paystack_subaccount_code` et `bearer = 'account'`
- **AND** la totalité du montant (hors frais) est réglée au subaccount de la cité

### Requirement: Mode SPLIT — partage de commission
Dans le mode `SPLIT`, le checkout Paystack SHALL être initialisé avec le `paystack_subaccount_code` de la cité et un ratio égal à `paystack_subaccount_split`, afin que MySyndic perçoive sa commission sur chaque paiement.

#### Scenario: Paiement en mode SPLIT
- **WHEN** la cité du payeur a `paystack_subaccount_mode = 'SPLIT'`
- **THEN** l'appel `initialize` Paystack passe le subaccount avec un split `percentage = paystack_subaccount_split`
- **AND** la part du syndic est créditée selon ce ratio, le solde restant à MySyndic

### Requirement: Ratio modifiable sans recréation
Le `paystack_subaccount_split` SHALL être modifiable à tout moment sans recréer le subaccount, et s'applique aux futurs paiements uniquement.

#### Scenario: Mise à jour du ratio
- **WHEN** le SUPER_ADMIN modifie `paystack_subaccount_split` de 86 à 90 pour une cité
- **THEN** la valeur en base est mise à jour
- **AND** les paiements ultérieurs de cette cité utilisent le nouveau ratio 90%
- **AND** les paiements déjà initiés conservent l'ancien ratio

### Requirement: Reçu PDF — source de vérité `recu_paiement`
`recu_paiement` SHALL rester l'unique table portant les données du reçu PDF (`file_path`, `qr_code_token`, `generated_at`). `paiement` SHALL ne pas porter de chemin de reçu. La présence d'un reçu pour un paiement SHALL être déterminée par jointure ou `EXISTS` sur `recu_paiement.paiement_id`.

#### Scenario: Historique expose le reçu
- **WHEN** la vue `v_historique_paiements_villa` est interrogée
- **THEN** le chemin du reçu est exposé sous l'alias `recu_file_path` via un `LEFT JOIN recu_paiement`
- **AND** une ligne de paiement sans reçu a `recu_file_path` NULL

### Requirement: Vérification du montant du webhook
`webhook.montant_match` SHALL être une generated column STORED, calculée par PostgreSQL comme `montant_recu = montant_attendu` quand les deux sont non NULL, sinon NULL. `montant_recu` et `montant_attendu` SHALL être écrits par le service ; `montant_match` ne DOIT jamais être écrits directement.

#### Scenario: Montants égaux
- **WHEN** un webhook est inséré avec `montant_attendu = 25000` et `montant_recu = 25000`
- **THEN** `montant_match` vaut `TRUE`

#### Scenario: Montants différents
- **WHEN** un webhook est inséré avec `montant_attendu = 25000` et `montant_recu = 10000`
- **THEN** `montant_match` vaut `FALSE`

#### Scenario: Reference orpheline
- **WHEN** un webhook est inséré avec `montant_attendu` NULL (aucun paiement correspondant)
- **THEN** `montant_match` vaut `NULL`