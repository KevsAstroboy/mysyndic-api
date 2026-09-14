# api-response-clean

## Purpose

Nettoyage des réponses JSON de l'API : suppression récursive des champs `null`/`undefined` (objets et tableaux) sans altérer les valeurs primitives non nulles, ne touchant pas aux réponses non-sérialisables (streams, buffers, réponses express brutes), et intraopérable avec le formatage des dates.

## Requirements

### Requirement: Suppression des champs null dans les réponses
Le système SHALL renvoyer des corps de réponse JSON où aucune clé n'a la valeur `null` ni `undefined`. Les clés nulles sont supprimées récursivement, dans les objets comme dans les tableaux (les éléments `null` retirés), sans altérer les valeurs primitives non nulles (`false`, `0`, chaîne vide).

#### Scenario: objet sans clé nulle
- **WHEN** un controller répond avec un objet dont certaines clés ont une valeur `null`
- **THEN** la réponse JSON ne contient aucune clé `null`, les clés nulles sont omises

#### Scenario: valeurs primitives conservées
- **WHEN** un objet contient `est_epinglee: false`, `count: 0` ou `note: ''`
- **THEN** ces clés sont conservées telles quelles

#### Scenario: aucune occurrence de null dans la sérialisation
- **WHEN** la réponse est sérialisée en JSON
- **THEN** la chaîne JSON ne contient pas le littéral `null`

### Requirement: Scapping des entités non-sérialisables
Le système SHALL ne pas altérer les réponses qui ne sont pas des JSON ordinaires : fichiers streamables (téléchargement PDF), réponses brutes express, buffers. Ces réponses SHALL être retournées telles quelles.

#### Scenario: téléchargement intact
- **WHEN** un endpoint retourne un `StreamableFile`
- **THEN** la réponse n'est pas traversée par le nettoyage et reste un stream

#### Scenario: réponse brute intacte
- **WHEN** une réponse est un objet express brut (avec `pipe`, `setHeader`, `json`)
- **THEN** elle est retournée sans modification

### Requirement: Intraopérabilité avec le formatage des dates
Le système SHALL appliquer le nettoyage des null APRÈS le formatage des dates, de sorte que les dates formatées (chaînes) soient conservées et que les champs de date absents (`deleted_at` non posé par exemple) soient retirés.

#### Scenario: date présente formatée
- **WHEN** une entité a `created_at` renseigné
- **THEN** le champ est retourné sous forme de chaîne formatée et la clé est conservée

#### Scenario: date absente retirée
- **WHEN** une entité n'a pas de `deleted_at`
- **THEN** la clé `deleted_at` est absente de la réponse