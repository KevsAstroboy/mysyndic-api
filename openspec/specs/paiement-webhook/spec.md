# paiement-webhook

## Purpose

TBD - Gestion des paiements de cotisation via Paystack et canaux manuels : initiation, webhook asynchrone, confirmations, reçus PDF et export.

## Requirements

### Requirement: Initiation d'un paiement Paystack
Le système SHALL permettre à un habitant d'initier le paiement de sa cotisation pour un mois via Paystack. Il SHALL vérifier que l'user occupe la villa (user_villa is_current), récupérer le montant depuis `configuration.cotisation_mensuelle`, insérer un paiement EN_ATTENTE avec canal PAYSTACK, appeler Paystack `/transaction/initialize`, et retourner `authorization_url` + `reference`. Un paiement déjà CONFIRME pour (villa,mois) SHALL être refusé.

#### Scenario: initiation réussie
- **WHEN** un habitant initie un paiement pour sa villa courante sur un mois sans paiement confirmé
- **THEN** un paiement EN_ATTENTE est créé, Paystack est appelé, et authorization_url + reference sont retournés

#### Scenario: villa non occupée par l'user
- **WHEN** l'user n'occupe pas la villa (aucune user_villa is_current)
- **THEN** une erreur 403 est renvoyée et aucun paiement n'est créé

#### Scenario: mois déjà confirmé
- **WHEN** un paiement CONFIRME existe déjà pour (villa,mois)
- **THEN** une erreur 409 est renvoyée

#### Scenario: montant absent de la config
- **WHEN** la configuration de la cité n'a pas de cotisation_mensuelle
- **THEN** une erreur 400 est renvoyée

### Requirement: Réception du webhook Paystack (signature)
Le système SHALL exposer `POST /webhooks/paystack` en public. Il SHALL vérifier la signature HMAC-SHA512 du corps brut avec la clé webhook de l'agrégateur avant tout traitement. En cas de signature invalide, le webhook SHALL être enregistré avec signature_ok=false et une erreur 401 SHALL être renvoyée.

#### Scenario: signature valide
- **WHEN** le header X-Paystack-Signature correspond au HMAC-SHA512 du payload
- **THEN** le webhook est accepté et traité

#### Scenario: signature invalide
- **WHEN** le header est absent ou ne correspond pas
- **THEN** une erreur 401 est renvoyée et le webhook est enregistré avec signature_ok=false

### Requirement: Idempotence proof webhook
Le système SHALL enregistrer chaque webhook reçu avec son agrégateur et sa référence. La contrainte UNIQUE(aggregateur_code, reference) SHALL garantir qu'une référence déjà traitée ne soit pas retraitée : une redondance SHALL répondre 200 sans double effet.

#### Scenario: doublon de référence
- **WHEN** le même payload de référence arrive une seconde fois
- **THEN** une réponse 200 est renvoyée et aucune confirmation supplémentaire n'est effectuée

### Requirement: Traitement asynchrone du webhook
Le système SHALL répondre 200 immédiatement après validation de la signature, puis traiter le paiement de façon asynchrone (fire-and-forget). Le traitement SHALL vérifier montant_match, mettre à jour le paiement en CONFIRME si correspondance, générer le reçu PDF, notifier les habitants, et journaliser l'audit.

#### Scenario: confirmation réussie
- **WHEN** le montant reçu correspond au montant attendu et le paiement est en EN_ATTENTE
- **THEN** le paiement passe à CONFIRME, le webhook est marqué traité, un reçu PDF est généré, et l'audit est écrit

#### Scenario: montant non correspondant
- **WHEN** montant_recu != montant_attendu
- **THEN** le paiement n'est pas confirmé et le webhook est enregistré avec montant_match=false

### Requirement: Saisie manuelle d'un paiement
Le système SHALL permettre à un syndic (feature `PAIEMENT_SAISIE_MANUELLE`) de saisir un ou plusieurs mois de cotisation pour une villa via canaux manuels (WAVE_MANUEL, ORANGE_MANUEL, MTN_MANUEL, CASH). Le nombre de mois SHALL être limité par `MULTI_MOIS_PAIEMENT_MAX` et un mois déjà CONFIRME SHALL être refusé. Chaque mois SHALL générer un reçu PDF.

#### Scenario: saisie multi-mois réussie
- **WHEN** un syndic saisit N mois pour une villa (canal manuel, N <= max)
- **THEN** N paiements CONFIRME sont créés en transaction, N reçus PDF sont générés, et l'audit est écrit

#### Scenario: trop de mois
- **WHEN** le nombre de mois dépasse MULTI_MOIS_PAIEMENT_MAX
- **THEN** une erreur 400 est renvoyée et aucun paiement n'est créé

#### Scenario: mois déjà confirmé
- **WHEN** un mois de la liste est déjà CONFIRME
- **THEN** une erreur 400 est renvoyée et la transaction est annulée

### Requirement: Historique et statistiques
Le système SHALL exposer l'historique des paiements d'une villa (identique pour tous ses occupants), les impayés du mois courant et le recouvrement mensuel, via les vues fournies et filtrés par cité.

#### Scenario: historique d'une villa
- **WHEN** un occupant ou un syndic consulte l'historique de la villa
- **THEN** tous les paiements de la villa sont retournés sans filtrer par user

#### Scenario: impayés mois courant
- **WHEN** un syndic consulte les impayés
- **THEN** les villas sans paiement CONFIRME du mois courant sont retournées

#### Scenario: recouvrement mensuel
- **WHEN** un syndic/admin consulte les statistiques de recouvrement
- **THEN** les agrégats mensuels (sum/count/taux) sont retournés

### Requirement: Reçu PDF
Le système SHALL générer un reçu PDF pour chaque paiement confirmé via PDFKit : logo MySyndic, nom cité, villa (numéro+rue), mois, montant, canal, référence, date/heure confirmation, et QR code (lien de vérification). Le reçu SHALL être stocké sur MinIO et consultable via une URL (générée on-demand si absent/marrée).

#### Scenario: téléchargement du reçu
- **WHEN** un user autorisé appelle GET /paiements/:id/recu
- **THEN** il obtient le PDF (ou l'URL signée MinIO), généré à la volée si absent

### Requirement: Export Excel des paiements
Le système SHALL exporter les paiements d'une cité en fichier Excel (feature `PAIEMENT_EXPORT_EXCEL`) avec les colonnes Villa, Mois, Montant, Canal, Statut, Date, Saisi Par.

#### Scenario: export
- **WHEN** un syndic/admin autorisé exporte
- **THEN** un fichier Excel avec les colonnes requises est retourné