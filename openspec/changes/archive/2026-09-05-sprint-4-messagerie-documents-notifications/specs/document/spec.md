## ADDED Requirements

### Requirement: Upload d'un document
Le système SHALL permettre à un membre autorisé (feature `DOCUMENT_UPLOAD`) d'uploader un document pour sa cité (multipart `file` + `titre`). Le fichier est stocké dans MinIO (bucket `MINIO_BUCKET_DOCUMENTS`), les métadonnées dans `document` avec `type_id` résolu par extension (`type_document`) et `taille_ko`.

#### Scenario: upload réussi
- **WHEN** un membre autorisé upload un fichier avec un titre pour sa cité
- **THEN** le fichier est stocké dans MinIO, une ligne `document` est créée (cite_id, auteur_id, titre, file_path, type_id, taille_ko) et le document apparaît dans la liste

#### Scenario: upload sans permission
- **WHEN** un utilisateur sans feature `DOCUMENT_UPLOAD` tente d'uploader un document
- **THEN** une erreur 403 est renvoyée

#### Scenario: upload hors cité rejeté
- **WHEN** le `cite_id` de la session ne correspond pas au scoping demandé
- **THEN** une erreur 403 est renvoyée (scoping systématique)

### Requirement: Liste des documents
Le système SHALL exposer, à tout membre autorisé (feature `DOCUMENT_READ`), la liste des documents de sa cité (`GET /documents`) triés par date décroissante, hors lignes soft-deletées, avec titre, type, taille et auteur.

#### Scenario: liste des documents de la cité
- **WHEN** un membre autorisé consulte les documents de sa cité
- **THEN** seuls les documents non supprimés de sa cité sont retournés, triés par date décroissante

#### Scenario: listes hors cité
- **WHEN** une requête de liste cible une cité différente de celle de la session
- **THEN** une erreur 403 est renvoyée

### Requirement: Téléchargement d'un document
Le système SHALL permettre à un membre autorisé (feature `DOCUMENT_READ`) de télécharger un document de sa cité (`GET /documents/:id/download`) via une URL pré-signée MinIO.

#### Scenario: téléchargement réussi
- **WHEN** un membre autorisé demande le téléchargement d'un document de sa cité
- **THEN** une URL pré-signée valide est retournée et le fichier est récupérable

#### Scenario: document hors cité introuvable
- **WHEN** un membre demande le téléchargement d'un document d'une autre cité ou supprimé
- **THEN** une erreur 404 est renvoyée

### Requirement: Suppression d'un document
Le système SHALL permettre à un membre autorisé (feature `DOCUMENT_DELETE`) de soft-deleter un document de sa cité (`DELETE /documents/:id`), posant `is_deleted=true` et `deleted_at`.

#### Scenario: suppression d'un document de la cité
- **WHEN** un membre autorisé supprime un document de sa cité
- **THEN** le document passe à `is_deleted=true` avec `deleted_at` et disparaît de la liste

#### Scenario: suppression hors cité rejetée
- **WHEN** un membre tente de supprimer un document d'une autre cité
- **THEN** une erreur 404 est renvoyée