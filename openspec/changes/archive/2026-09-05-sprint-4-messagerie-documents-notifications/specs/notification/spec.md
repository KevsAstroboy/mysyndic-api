## ADDED Requirements

### Requirement: Émission d'une notification temps réel
Le système SHALL émettre une notification en temps réel via socket à l'utilisateur ciblé (événement `notification:new`, room `user:{userId}`) dès qu'une notification est créée pour lui, qu'elle soit directe (`sendToUser`) ou issue d'une diffusion (`sendToCite`).

#### Scenario: notification privée poussée
- **WHEN** une notification est créée pour un utilisateur (`sendToUser`)
- **THEN** l'événement socket `notification:new` est émis dans la room `user:{userId}` et la notification est persistée en PG

#### Scenario: notification diffusée poussée
- **WHEN** une notification est diffusée via `sendToCite`
- **THEN** une ligne `notification` est créée pour chaque occupant ciblé et l'événement `notification:new` est émis vers chaque room `user:{userId}`

### Requirement: Diffusion ciblée d'une notification
Le système SHALL permettre à `NotifService` de diffuser une notification vers des sous-ensembles de la cité via `sendToCite(cite_id, titre, message, options)` avec ciblage par features RBAC (ex : uniquement les syndics via `features: ['ALERTE_UPDATE_STATUT']`) et exclusion éventuelle de l'utilisateur déclencheur (`exceptUserId`).

#### Scenario: diffusion aux occupants
- **WHEN** `sendToCite` est appelé sans filtre de features
- **THEN** une notification est créée pour tous les occupants actifs non supprimés de la cité

#### Scenario: diffusion ciblée syndics
- **WHEN** `sendToCite` est appelé avec `features: [feature]`
- **THEN** seuls les occupants dont le profil actif porte cette feature reçoivent la notification

#### Scenario: exclusion de l'émetteur
- **WHEN** `sendToCite` est appelé avec `exceptUserId`
- **THEN** aucune notification n'est créée pour cet utilisateur

### Requirement: Liste des notifications
Le système SHALL exposer, à tout utilisateur authentifié, la liste de ses notifications (`GET /notifications`) triées par date décroissante et scoped à sa cité, hors lignes soft-deletées.

#### Scenario: liste de ses notifications
- **WHEN** un utilisateur consulte ses notifications
- **THEN** seules ses notifications non supprimées (de ses cités rattachées) sont retournées, triées par date décroissante

#### Scenario: notifications hors cité non visibles
- **WHEN** une notification concerne une cité étrangère à l'utilisateur
- **THEN** elle n'apparaît pas dans sa liste

### Requirement: Badge de notifications non lues
Le système SHALL exposer le nombre de notifications non lues de l'utilisateur (`GET /notifications/badge`), mis à jour à la création, la lecture et la lecture groupée.

#### Scenario: badge compté
- **WHEN** un utilisateur demande son badge
- **THEN** le nombre de notifications non lues (`lu=false`) est retourné

### Requirement: Marquage lu
Le système SHALL permettre à un utilisateur de marquer une de ses notifications comme lue (`PATCH /notifications/:id/lu`) ou toutes ses notifications (`PATCH /notifications/read-all`), posant `lu=true` et `lu_at`.

#### Scenario: lecture d'une notification
- **WHEN** un utilisateur marque sa notification comme lue
- **THEN** `lu=true` et `lu_at` sont posés et le badge diminue

#### Scenario: lecture groupée
- **WHEN** un utilisateur marque toutes ses notifications comme lues
- **THEN** toutes ses notifications non supprimées passent à `lu=true` et le badge passe à 0

#### Scenario: notification d'autrui non marquable
- **WHEN** un utilisateur tente de marquer lu une notification qui ne lui appartient pas
- **THEN** une erreur 404 est renvoyée