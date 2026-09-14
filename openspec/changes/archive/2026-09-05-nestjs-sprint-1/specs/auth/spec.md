## ADDED Requirements

### Requirement: Inscription habitant
Le système SHALL permettre à un habitant de s'inscrire librement avec email, mot de passe, nom, prénom, téléphone et villa de la cité. L'inscription SHALL créer l'user, l'user_villa courant (is_current TRUE), ajouter l'user au groupe de sa cité (procédure `add_user_to_cite_groupe`) et journaliser dans audit_log. Le compte SHALL être créé actif sans OTP au Sprint 1 (mode simplifié).

#### Scenario: Inscription avec villa valide
- **WHEN** un habitant s'inscrit avec un villa_id appartenant à la cité
- **THEN** user + user_villa (is_current=TRUE) + groupe_cite_membre sont créés, audit_log est écrit, et une réponse 201 avec user et token est renvoyée

#### Scenario: villa inexistante ou hors cité
- **WHEN** un habitant s'inscrit avec un villa_id inexistant ou d'une autre cité
- **THEN** une erreur 400 est renvoyée et aucune donnée n'est créée

#### Scenario: email déjà utilisé
- **WHEN** l'email fourni existe déjà sur un user actif
- **THEN** une erreur 409 est renvoyée et aucun compte n'est créé

### Requirement: Connexion
Le système SHALL authentifier l'user par email ou téléphone + mot de passe (bcrypt). Au succès, il SHALL construire le JWT (access + refresh), charger profils et features dans Redis `session:{user_id}` avec versions de profils, et retourner user + tokens + features. Une connexion d'un user inactif ou désactivé SHALL être refusée.

#### Scenario: connexion réussie
- **WHEN** email et mot de passe valides sur un user actif
- **THEN** access_token + refresh_token sont retournés, la session Redis contient les features du profil, et le payload JWT contient sub, email, role, cite_id, must_change_password

#### Scenario: mot de passe incorrect
- **WHEN** le mot de passe est invalide
- **THEN** une erreur 401 est renvoyée et aucune session n'est créée

#### Scenario: compte désactivé
- **WHEN** l'user a is_active false
- **THEN** une erreur 401 est renvoyée

#### Scenario: compte à mot de passe temporaire
- **WHEN** must_change_password est true à la connexion
- **THEN** la connexion réussit et la réponse signale must_change_password=true

### Requirement: Changement de mot de passe
Le système SHALL permettre à un user connecté de changer son mot de passe en fournissant l'ancien. Au succès, le hash est mis à jour, must_change_password passe à false, et la session Redis est actualisée. Un user avec must_change_password=true SHALL être bloqué sur toutes les routes sauf le changement de mot de passe (guard MustChangePasswordGuard).

#### Scenario: changement réussi
- **WHEN** un user connecté fournit ancien + nouveau mot de passe
- **THEN** le hash est remplacé, must_change_password=false, et le change-password endpoint répond 200

#### Scenario: ancien mot de passe incorrect
- **WHEN** l'ancien mot de passe ne correspond pas
- **THEN** une erreur 400 est renvoyée et le mot de passe n'est pas modifié

#### Scenario: accès bloqué tant que mot de passe non changé
- **WHEN** un user avec must_change_password=true appelle une route protégée autre que /auth/change-password
- **THEN** une erreur 403 code MUST_CHANGE_PASSWORD est renvoyée

### Requirement: Mot de passe oublié / réinitialisation
Le système SHALL générer un OTP à la demande de mot de passe oublié, l'envoyer par email, et permettre la réinitialisation sur vérification de l'OTP. La réponse ne révèle SHALL PAS si l'email existe (anti-enumeration).

#### Scenario: demande d'OTP
- **WHEN** un user demande un mot de passe oublié avec son email
- **THEN** un OTP est enregistré et envoyé, et la réponse est générique sans révéler l'existence du compte

#### Scenario: réinitialisation avec OTP valide
- **WHEN** l'user fournit l'email, l'OTP valide et un nouveau mot de passe
- **THEN** le mot de passe est mis à jour, must_change_password=false, l'OTP est consommé

#### Scenario: OTP invalide ou expiré
- **WHEN** l'OTP fourni est incorrect ou expiré
- **THEN** une erreur 400 est renvoyée et le mot de passe n'est pas modifié

### Requirement: Déconnexion
Le système SHALL invalider la session Redis de l'user à la déconnexion et journaliser l'action LOGOUT dans audit_log.

#### Scenario: déconnexion
- **WHEN** un user connecté appelle POST /auth/logout
- **THEN** la session Redis est supprimée, l'audit LOGOUT est écrit, réponse 200

### Requirement: Guards d'authentification et RBAC
Le système SHALL exposer un RbacGuard qui lit les features depuis la session Redis (jamais la DB à chaque requête), vérifie la fraîcheur de la session par comparaison des features_version des profils, et refuse 403 si la feature requise est absente. Toutes les routes protégées SHALL exiger un JWT valide.

#### Scenario: accès sans token
- **WHEN** une route protégée est appelée sans Bearer token
- **THEN** une erreur 401 est renvoyée

#### Scenario: feature manquante
- **WHEN** un user sans la feature requise appelle une route
- **THEN** une erreur 403 est renvoyée et la feature n'est pas résolue depuis la DB si la session est fraîche

#### Scenario: session périmée
- **WHEN** la version d'un profil a changé en DB (features_version différent de la session)
- **THEN** la session est recalculée depuis la DB avant de décider l'accès