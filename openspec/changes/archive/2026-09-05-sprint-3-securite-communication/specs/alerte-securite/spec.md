## ADDED Requirements

### Requirement: Création d'une alerte sécurité
Le système SHALL permettre à un habitant (feature `ALERTE_CREATE`) de créer une alerte sécurité scoped à sa cité, avec description, motif optionnel, villa optionnelle et photo optionnelle. L'alerte est créée avec statut par défaut (statut_alerte id par défaut) et `escalade=false`.

#### Scenario: création réussie
- **WHEN** un habitant crée une alerte pour sa cité
- **THEN** une alerte est enregistrée avec cite_id, habitant_id (auteur), statut par défaut non résolu et escalade false

#### Scenario: alerte d'une autre cité rejetée
- **WHEN** un habitant crée une alerte pour une cité qui n'est pas la sienne
- **THEN** l'alerte n'est pas créée et une erreur 403 est renvoyée

### Requirement: Lecture des alertes
Le système SHALL exposer les alertes actives (feature `ALERTE_READ_ACTIVE`) et l'historique (feature `ALERTE_READ_HISTORY`) de la cité, triés par `created_at` décroissant et excluant les lignes soft-deletées.

#### Scenario: liste des alertes actives
- **WHEN** un habitant autorisé consulte les alertes actives de sa cité
- **THEN** seules les alertes non résolues et non supprimées de la cité sont retournées

#### Scenario: historique des alertes
- **WHEN** un habitant autorisé consulte l'historique des alertes de sa cité
- **THEN** toutes les alertes de la cité non supprimées sont retournées, résolues ou non, triées par date décroissante

### Requirement: Changement de statut et escalade
Le système SHALL permettre à un syndic (feature `ALERTE_UPDATE_STATUT`) de changer le statut d'une alerte de la cité et de l'escalader (passage de `escalade` à vrai avec `escalade_at`).

#### Scenario: changement de statut
- **WHEN** un syndic de la cité change le statut d'une alerte
- **THEN** le statut est mis à jour et l'alerte est portée à jour

#### Scenario: escalade
- **WHEN** un syndic escalade une alerte non encore escaladée
- **THEN** `escalade` passe à true et `escalade_at` est enregistré

### Requirement: Résolution d'une alerte
Le système SHALL permettre à un syndic (feature `ALERTE_UPDATE_STATUT`) de résoudre une alerte de la cité en enregistrant `resolu_par` et `resolu_at`.

#### Scenario: résolution
- **WHEN** un syndic résout une alerte
- **THEN** le statut passe à résolu, `resolu_par` et `resolu_at` sont enregistrés, et l'alerte disparaît des alertes actives