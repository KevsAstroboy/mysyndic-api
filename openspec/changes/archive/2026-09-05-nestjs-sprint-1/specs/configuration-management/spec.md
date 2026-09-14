## ADDED Requirements

### Requirement: Lecture de la configuration d'une cité
Le système SHALL exposer GET /configuration retournant la configuration de la cité de l'user connecté (features Paystack, cotisation mensuelle, lien Wave, subaccount code). Les valeurs sensibles de clés secrètes SHALL être masquées partiellement dans les réponses non Super Admin.

#### Scenario: lecture pour sa cité
- **WHEN** un ADMIN/SYNDIC connecté appelle GET /configuration
- **THEN** la configuration de sa cité est retournée, clés secrètes masquées

#### Scenario: user d'une autre cité
- **WHEN** un user tente de lire la configuration d'une autre cité
- **THEN** seule la configuration de sa cité est accessible (403 si cross-cite flag true)

### Requirement: Mise à jour de la configuration
Le système SHALL permettre à un ADMIN ou SUPER_ADMIN (feature `ADMIN_CONFIG_CITE`) de mettre à jour la configuration de la cité : cotisation mensuelle, lien Wave, subaccount Paystack (code/mode/split), et de journaliser la modification dans audit_log. Le mode subaccount SHALL être SIMPLE ou SPLIT, le split SHALL être entre 1 et 100.

#### Scenario: mise à jour valide
- **WHEN** un ADMIN met à jour cotisation et subaccount de sa cité
- **THEN** la configuration est mise à jour, l'audit est écrit, réponse 200

#### Scenario: split invalide
- **WHEN** le subaccount split fourni est hors bornes 1-100
- **THEN** une erreur 400 est renvoyée et rien n'est modifié

#### Scenario: accès interdit
- **WHEN** un user sans ADMIN_CONFIG_CITE tente de modifier la configuration
- **THEN** une erreur 403 est renvoyée