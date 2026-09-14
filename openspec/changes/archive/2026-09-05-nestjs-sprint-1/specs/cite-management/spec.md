## ADDED Requirements

### Requirement: CRUD cités réservé Super Admin
Le système SHALL réserver la gestion des cités au profil SUPER_ADMIN via les features `SA_CREATE_CITE` et `SA_READ_ALL_CITES`. GET /cites SHALL retourner toutes les cités avec statistiques agrégées (nb villas, nb habitants, taux de recouvrement).

#### Scenario: liste toutes les cités
- **WHEN** un SUPER_ADMIN appelle GET /cites
- **THEN** toutes les cités sont retournées avec stats agrégées

#### Scenario: création interdite hors Super Admin
- **WHEN** un ADMIN ou SYNDIC appelle POST /cites
- **THEN** une erreur 403 est renvoyée

#### Scenario: création avec nom dupliqué
- **WHEN** la cité a déjà un nom existant
- **THEN** une erreur 409 est renvoyée

### Requirement: Création de cité atomique
Le système SHALL créer une cité dans une transaction qui : insère cite, insère groupe_cite (nom "Chat {cite.nom}"), insère configuration par défaut, et journalise l'action dans audit_log. Toute étape en échec SHALL annuler l'ensemble.

#### Scenario: création réussie
- **WHEN** un SUPER_ADMIN crée une cité valide
- **THEN** cite, groupe_cite, configuration et audit_log sont créés de façon atomique, réponse 201

#### Scenario: échec d'une étape
- **WHEN** une des insertions échoue (ex. contrainte)
- **THEN** la transaction est annulée et aucune partie de la cité n'est persistée

### Requirement: Mise à jour de cité
Le système SHALL permettre la mise à jour non sensible d'une cité (nom, adresse, ville) par un SUPER_ADMIN.

#### Scenario: mise à jour
- **WHEN** un SUPER_ADMIN met à jour une cité existante
- **THEN** les champs sont mis à jour et l'action est journalisée dans audit_log

#### Scenario: cité inexistante
- **WHEN** l'id de cité n'existe pas
- **THEN** une erreur 404 est renvoyée