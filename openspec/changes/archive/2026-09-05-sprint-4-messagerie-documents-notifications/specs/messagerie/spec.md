## ADDED Requirements

### Requirement: Envoi d'un message privé
Le système SHALL permettre à un habitant (feature `MESSAGE_SEND_PRIVATE`) d'envoyer un message privé à un destinataire de sa cité (expéditeur et destinataire `cite_id` identiques). Le message est enregistré avec `est_groupe=false`, `destinataire_id`, les métadonnées en PG et le contenu dans MongoDB (`mongo_doc_id`).

#### Scenario: envoi réussi
- **WHEN** un habitant autorisé envoie un message privé à un occupant de sa cité
- **THEN** un message est enregistré (métadonnées PG + contenu Mongo) avec `est_groupe=false` et l'événement socket `message:new` est émis vers le destinataire

#### Scenario: destinataire hors cité rejeté
- **WHEN** un habitant envoie un message privé à un utilisateur d'une autre cité
- **THEN** une erreur 400 est renvoyée et aucun message n'est créé

#### Scenario: expéditeur sans permission
- **WHEN** un utilisateur sans feature `MESSAGE_SEND_PRIVATE` tente d'envoyer un message privé
- **THEN** une erreur 403 est renvoyée

### Requirement: Envoi d'un message de groupe
Le système SHALL permettre à un membre de la cité (feature `MESSAGE_SEND_GROUPE`) d'envoyer un message au groupe de sa cité. Le message est enregistré avec `est_groupe=true`, le `groupe_id` de la cité, et est diffusé via socket à tous les occupants connectés.

#### Scenario: diffusion à la cité
- **WHEN** un membre autorisé envoie un message au groupe de sa cité
- **THEN** un message est enregistré avec `est_groupe=true` et `groupe_id`, et l'événement socket `message:new` est émis dans la room `cite:{citeId}`

#### Scenario: groupe inexistant créé
- **WHEN** la cité n'a pas encore de `groupe_cite`
- **THEN** le groupe de la cité est créé automatiquement (upsert) avant l'enregistrement du message

### Requirement: Historique des conversations
Le système SHALL exposer, à tout utilisateur authentifié de la cité, la liste de ses conversations (`GET /messages/conversations`) et l'historique d'une conversation privée ou de groupe (`GET /messages/conversations/:userId`), triés par date décroissante, hors lignes soft-deletées.

#### Scenario: liste des conversations
- **WHEN** un occupant de la cité consulte ses conversations
- **THEN** les threads privés et groupe auxquels il participe sont retournés avec le dernier message et le nombre de non-lus

#### Scenario: historique d'une conversation privée
- **WHEN** un occupant consulte une conversation privée avec un autre occupant
- **THEN** seuls les messages de la cité concernant ce thread sont retournés, triés par date décroissante

#### Scenario: historique hors cité rejeté
- **WHEN** un occupant consulte l'historique d'un thread d'une autre cité
- **THEN** une erreur 404 est renvoyée (aucune donnée divulguée)

### Requirement: Marquage lu d'un message
Le système SHALL permettre à un destinataire de marquer un message privé comme lu (`PATCH /messages/:id/lu`), enregistrant l'état dans Redis (`msg:read:{userId}`, TTL `REDIS_MSG_LU_TTL_DAYS`).

#### Scenario: message privé marqué lu
- **WHEN** le destinataire d'un message privé le marque comme lu
- **THEN** l'état lu est enregistré en Redis et le badge de non-lus diminue

#### Scenario: non-destinataire rejeté
- **WHEN** un utilisateur qui n'est ni destinataire ni expéditeur tente de marquer un message lu
- **THEN** une erreur 403 est renvoyée

### Requirement: Suppression de son message
Le système SHALL permettre à un utilisateur (feature `MESSAGE_DELETE_OWN`) de soft-deleter un de ses messages (`DELETE /messages/:id`), posant `is_deleted=true` et `deleted_at`.

#### Scenario: suppression de son propre message
- **WHEN** l'expéditeur supprime son message
- **THEN** le message passe à `is_deleted=true` avec `deleted_at` et disparaît des historiques

#### Scenario: suppression d'un message d'autrui rejetée
- **WHEN** un utilisateur tente de supprimer un message dont il n'est pas l'expéditeur
- **THEN** une erreur 403 est renvoyée