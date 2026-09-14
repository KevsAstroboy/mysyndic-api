## ADDED Requirements

### Requirement: Logging structuré JSON
Le système SHALL émettre les logs applicatifs au format JSON structuré (une ligne par événement) avec les champs `level`, `time` (ISO), `msg`, `pid`, `hostname`, et le contexte (`context` du Logger Nest). Le format JSON SHALL être actif en production ; en développement (`NODE_ENV !== 'production'`) une sortie console lisible (`pino-pretty`) est autorisée.

#### Scenario: log applicatif en JSON
- **WHEN** un service émet un log via `Logger` Nest
- **THEN** la sortie est une ligne JSON avec `level`, `time`, `msg` et `context`

#### Scenario: format lisible en développement
- **WHEN** `NODE_ENV != production`
- **THEN** les logs sont rendus lisibles (pretty) sans perte d'information

### Requirement: Niveaux configurables
Le système SHALL respecter le niveau de log configuré via la variable d'environnement `LOG_LEVEL` (valeurs `trace|debug|info|warn|error`), par défaut `info`. Les messages de niveau inférieur au seuil SHALL être filtrés.

#### Scenario: configuration du seuil
- **WHEN** `LOG_LEVEL=warn` est défini
- **THEN** seuls les messages `warn` et `error` sont émis

### Requirement: Correlation id par requête
Le système SHALL associer un identifiant unique (correlation id) à chaque requête HTTP, propagé dans les logs de début et fin de requête, retourné dans le header `X-Request-Id` de la réponse, et inclus dans le body d'erreur sous la clé `requestId`.

#### Scenario: id présent dans les réponses
- **WHEN** un client appelle une route de l'API
- **THEN** la réponse porte le header `X-Request-Id` avec un identifiant unique

#### Scenario: id dans le body d'erreur
- **WHEN** une route renvoie une erreur 4xx/5xx
- **THEN** le corps d'erreur contient `requestId` identique au `X-Request-Id` de la réponse

### Requirement: Journalisation des requêtes HTTP
Le système SHALL logger le début et la fin de chaque requête HTTP avec la méthode, le chemin, le status, et la durée en millisecondes (`req.id`, `req.method`, `req.url`, `res.statusCode`, `responseTime`).

#### Scenario: requête journalisée
- **WHEN** un client appelle une route
- **THEN** une ligne de log « request completed » est émise avec méthode, chemin, status et durée

### Requirement: Redaction des données sensibles
Le système SHALL ne jamais écrire dans les logs les valeurs de champs sensibles : `Authorization`/`cookie` des headers, mots clés `password`, `password_hash`, `token`, `access_token`, `refresh_token`, `secret`, `PAYSTACK_SECRET_KEY`, `GMAIL_APP_PASSWORD`. Ces valeurs SHALL être remplacées par la chaîne `[Redacted]`.

#### Scenario: header Authorization masqué
- **WHEN** une requête authentifiée est loggée
- **THEN** la valeur du header `Authorization` n'apparaît pas, remplacée par `[Redacted]`

#### Scenario: mot de passe masqué
- **WHEN** un objet contenant `password` ou `password_hash` est loggé
- **THEN** la valeur est remplacée par `[Redacted]`