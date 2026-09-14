## ADDED Requirements

### Requirement: Déclaration d'un conflit
Le système SHALL permettre à un habitant (feature `CONFLIT_CREATE`) de déclarer un conflit scoped à sa cité, avec description obligatoire, villa déclarant, villa ciblée (numero obligatoire), catégorie optionnelle et statut initial par défaut (déclaré).

#### Scenario: déclaration réussie
- **WHEN** un habitant déclare un conflit pour sa cité
- **THEN** un conflit est enregistré avec declarant_id = l'habitant, villa_ciblee_num et un statut initial non traité

#### Scenario: conflit hors cité rejeté
- **WHEN** un habitant tente de déclarer un conflit pour une autre cité
- **THEN** une erreur 403 est renvoyée et aucun conflit n'est créé

### Requirement: Lecture des conflits
Le système SHALL exposer les conflits de l'utilisateur (feature `CONFLIT_READ_OWN`) et tous les conflits de la cité (feature `CONFLIT_READ_ALL`), triés par date décroissante, hors lignes supprimées.

#### Scenario: mes conflits
- **WHEN** un habitant consulte `mes-conflits`
- **THEN** seuls les conflits dont il est déclarant dans sa cité sont retournés

#### Scenario: tous les conflits
- **WHEN** un syndic autorisé consulte tous les conflits
- **THEN** tous les conflits non supprimés de la cité sont retournés

### Requirement: Prise en charge d'un conflit
Le système SHALL permettre à un syndic (feature `CONFLIT_MANAGE`) de prendre en charge un conflit de la cité, en enregistrant `pris_en_charge_par` et `pris_en_charge_at`.

#### Scenario: prise en charge
- **WHEN** un syndic prend en charge un conflit de sa cité
- **THEN** `pris_en_charge_par` et `pris_en_charge_at` sont enregistrés et le statut passe à "pris en charge"

#### Scenario: conflit déjà pris en charge
- **WHEN** un syndic tente de reprendre un conflit déjà pris en charge
- **THEN** une erreur 409 est renvoyée

### Requirement: Résolution d'un conflit avec notes
Le système SHALL permettre à un syndic (feature `CONFLIT_MANAGE`) de résoudre un conflit en renseignant une note de résolution, en enregistrant `resolu_at`, et éventuellement une `note_syndic` sans résolution.

#### Scenario: résolution avec note
- **WHEN** un syndic résout un conflit avec `resolution_note`
- **THEN** le conflit passe au statut résolu, `resolu_at` est enregistré et la note est sauvegardée

#### Scenario: note syndic sans résolution
- **WHEN** un syndic renseigne une `note_syndic` sans résoudre
- **THEN** la note est sauvegardée sans changer le statut ni poser `resolu_at`