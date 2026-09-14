## ADDED Requirements

### Requirement: Profil de l'user connecté
Le système SHALL exposer GET /users/me retournant l'identité de l'user, sa villa courante, sa cité et son profil. L'user SHALL pouvoir mettre à jour ses informations non sensibles.

#### Scenario: lecture de son profil
- **WHEN** un user connecté appelle GET /users/me
- **THEN** user, villa courante, cité et profil sont retournés

#### Scenario: mise à jour des infos non sensibles
- **WHEN** un user met à jour prenom, nom ou téléphone
- **THEN** les champs sont mis à jour et la réponse 200

#### Scenario: numéro déjà utilisé
- **WHEN** le téléphone fourni est déjà utilisé par un autre user
- **THEN** une erreur 409 est renvoyée

### Requirement: Création de personnel (staff)
Le système SHALL permettre à un ADMIN de créer un SYNDIC ou CHEF_SECURITE (feature `ADMIN_CREATE_STAFF`). La création SHALL générer un mot de passe temporaire, hasher bcrypt (rounds 12), créer l'user avec must_change_password=TRUE, l'ajouter au groupe de sa cité, envoyer un email avec identifiants, et journaliser.

#### Scenario: création staff réussie
- **WHEN** un ADMIN crée un SYNDIC ou CHEF_SECURITE
- **THEN** l'user est créé avec must_change_password=TRUE, un mdp temporaire est retourné une seule fois, l'email est envoyé, l'user est ajouté au groupe, audit_log écrit

#### Scenario: email déjà utilisé
- **WHEN** l'email du staff existe déjà
- **THEN** une erreur 409 est renvoyée et aucun compte n'est créé

#### Scenario: accès interdit
- **WHEN** un user sans feature ADMIN_CREATE_STAFF appelle POST /users/staff
- **THEN** une erreur 403 est renvoyée

### Requirement: Activation / désactivation de compte
Le système SHALL permettre à un ADMIN d'activer ou désactiver un compte (feature `ADMIN_DEACTIVATE_USER`). Un compte désactivé SHALL être refusé à la connexion.

#### Scenario: désactivation
- **WHEN** un ADMIN désactive un user
- **THEN** is_active=false et la session Redis du user est invalidée

#### Scenario: réactivation
- **WHEN** un ADMIN réactive un user désactivé
- **THEN** is_active=true et le user peut se reconnecter