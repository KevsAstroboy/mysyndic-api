## ADDED Requirements

### Requirement: CRUD villas par cité
Le système SHALL permettre aux ADMIN et SYNDIC de lister, créer, consulter et mettre à jour les villas de leur cité uniquement (filtre cite_id systématique). Le numéro de villa SHALL être unique dans la cité. Le détail d'une villa SHALL inclure les occupants actuels et l'historique des paiements.

#### Scenario: liste villas de la cité
- **WHEN** un ADMIN ou SYNDIC appelle GET /villas
- **THEN** seules les villas de sa cité sont retournées

#### Scenario: doublon de numéro
- **WHEN** une villa est créée avec un numéro déjà existant dans la cité
- **THEN** une erreur 409 est renvoyée

#### Scenario: numéro dupliqué dans une autre cité
- **WHEN** un même numéro existe dans une autre cité
- **THEN** la création est acceptée (contrainte scoping cité)

### Requirement: Assignation d'un user à une villa
Le système SHALL assigner un user à une villa via une transaction : l'ancienne villa courante de l'user (is_current TRUE) passe à FALSE, une nouvelle user_villa (is_current TRUE) est créée, et l'action est auditée. L'assignation SHALL être limitée à la même cité.

#### Scenario: assignation réussie
- **WHEN** un ADMIN/SYNDIC assigne un user à une villa de sa cité
- **THEN** l'ancienne villa est désactivée, la nouvelle user_villa is_current=TRUE est créée, audit_log écrit

#### Scenario: villa d'une autre cité
- **WHEN** la villa cible n'appartient pas à la cité de l'user
- **THEN** une erreur 403 est renvoyée

### Requirement: Désassignation d'un user
Le système SHALL retirer un user d'une villa (désactiver sa user_villa courante).

#### Scenario: désassignation réussie
- **WHEN** un ADMIN/SYNDIC désassigne un user de sa villa courante
- **THEN** la user_villa is_current passe à FALSE et l'action est auditée