## ADDED Requirements

### Requirement: Signalement d'un incident
Le système SHALL permettre à un habitant (feature `INCIDENT_CREATE`) de signaler un incident scoped à sa cité, avec titre, description obligatoire, catégorie optionnelle, villa optionnelle et photo optionnelle.

#### Scenario: signalement réussi
- **WHEN** un habitant signale un incident pour sa cité
- **THEN** un incident est enregistré avec auteur_id = l'habitant et cite_id = sa cité

#### Scenario: incident hors cité rejeté
- **WHEN** un habitant tente de signaler un incident pour une autre cité
- **THEN** une erreur 403 est renvoyée et aucun incident n'est créé

### Requirement: Liste et détail d'un incident
Le système SHALL exposer la liste des incidents de la cité (feature `INCIDENT_READ`) triés par date décroissante, et le détail d'un incident avec nombre de likes, statut "liké par moi", et commentaires arborescents (niveau 1/2).

#### Scenario: liste des incidents de la cité
- **WHEN** un habitant autorisé consulte les incidents de sa cité
- **THEN** tous les incidents non supprimés de la cité sont retournés triés par date décroissante

#### Scenario: détail d'un incident
- **WHEN** un habitant consulte le détail d'un incident
- **THEN** le détail expose le nombre de likes, si l'utilisateur courant a liké, et les commentaires organisés en 2 niveaux maximum

### Requirement: Likes sur un incident
Le système SHALL permettre à un habitant (feature `INCIDENT_LIKE`) de liker/unliker un incident. Une fois liké, un second appel de like doit unliker (toggle). La clé composite (incident_id, user_id) SHALL garantir l'unicité.

#### Scenario: like
- **WHEN** un habitant like un incident non encore liké
- **THEN** une ligne incident_like (incident_id, user_id) est créée

#### Scenario: unlike
- **WHEN** un habitant like un incident déjà liké par lui
- **THEN** la ligne incident_like est supprimée (toggle)

### Requirement: Commentaires sur un incident
Le système SHALL permettre à un habitant (feature `INCIDENT_COMMENT`) de commenter un incident (niveau 1) et de répondre à un commentaire (niveau 2). Un commentaire de niveau 1 ne peut recevoir qu'un seul niveau de réponse (niveau 2), pas de niveau 3.

#### Scenario: commentaire niveau 1
- **WHEN** un habitant commente un incident
- **THEN** un commentaire de niveau 1 est créé

#### Scenario: réponse niveau 2
- **WHEN** un habitant répond à un commentaire de niveau 1
- **THEN** un commentaire de niveau 2 avec parent_id = commentaire d'origine est créé

#### Scenario: profondeur maximale
- **WHEN** un habitant tente de répondre à un commentaire de niveau 2
- **THEN** une erreur 400 est renvoyée (profondeur max 2 atteinte)