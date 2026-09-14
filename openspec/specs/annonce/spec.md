# annonce

## Purpose

Gestion des annonces d'une cité : création, lecture (épinglées d'abord), modification et suppression (soft-delete) par les syndics, consultation par les habitants.

## Requirements

### Requirement: Création d'une annonce
Le système SHALL permettre à un syndic (feature `ANNONCE_CREATE`) de créer une annonce scoped à sa cité, avec titre (obligatoire), contenu (obligatoire), catégorie optionnelle et épinglage optionnel (`est_epinglee`).

#### Scenario: création réussie
- **WHEN** un syndic crée une annonce pour sa cité
- **THEN** une annonce est enregistrée avec auteur_id = le syndic et cite_id = sa cité

#### Scenario: annonce hors cité rejetée
- **WHEN** un syndic tente de créer une annonce pour une autre cité
- **THEN** une erreur 403 est renvoyée et aucune annonce n'est créée

### Requirement: Lecture des annonces
Le système SHALL exposer la liste des annonces de la cité (feature `ANNONCE_READ`) à tous les habitants, triées avec les épinglées d'abord puis par date décroissante, hors lignes supprimées.

#### Scenario: liste des annonces
- **WHEN** un habitant autorisé consulte les annonces de sa cité
- **THEN** les annonces non supprimées sont retournées, les épinglées en premier puis triées par date décroissante

### Requirement: Modification d'une annonce
Le système SHALL permettre à un syndic (feature `ANNONCE_UPDATE`) de modifier une annonce existante de la cité (titre, contenu, catégorie, épinglage).

#### Scenario: modification
- **WHEN** un syndic modifie une annonce de sa cité
- **THEN** les champs fournis sont mis à jour et `updated_at` est posé

#### Scenario: modification d'annonce d'une autre cité
- **WHEN** un syndic tente de modifier une annonce d'une autre cité
- **THEN** une erreur 404 est renvoyée (annonce introuvable dans sa cité)

### Requirement: Suppression d'une annonce
Le système SHALL permettre à un syndic (feature `ANNONCE_DELETE`) de supprimer (soft-delete) une annonce de la cité.

#### Scenario: suppression
- **WHEN** un syndic supprime une annonce de sa cité
- **THEN** l'annonce passe à `is_deleted=true` avec `deleted_at` et `deleted_by` posés