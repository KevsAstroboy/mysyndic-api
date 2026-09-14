## Why

Les habitants doivent pouvoir interagir sur les sujets de la cité : signaler des problèmes (alertes sécurité, incidents, conflits) et recevoir/emettre des annonces. Ces 4 entités existent déjà dans le schéma (tables `alerte_securite`, `incident` + `incident_like`/`incident_commentaire`, `conflit`, `annonce`), et leurs features asociées sont seedées. Il manque les modules backend complets (CRUD + workflow statuts + réactions + périmetrage par cité) pour que le frontend puisse s'appuyer dessus.

## What Changes

- **Modules complets** pour 4 entités, générés via le générateur (`scripts/generate-module.ts`) puis adaptés :
  - `alerte` : création (habitant), lecture actives (tout habitant), historique, changement de statut + escalade (syndic), résolution.
  - `incident` : signalement, liste, détail, like/unlike, commentaires hiérarchisés (2 niveaux max).
  - `conflit` : déclaration (habitant), lecture propre/globale, prise en charge + résolution + note syndic (syndic).
  - `annonce` : lecture (tous), création/édition/suppression (syndic), épinglage.

- **Périmetrage cité** : tous les endpoints scopes par `cite_id` (décorateur `@CiteId` + `hasCiteId`), cohérent avec les modules existants.

- **Gards** : features respectives sur les controllers (ALERTE_CREATE/READ_*, INCIDENT_*, CONFLIT_*, ANNONCE_*).

- **Soft-delete** : `is_deleted`/`deleted_at` respectés sur les entités concernées.

## Capabilities

### New Capabilities
- `alerte-securite`: Création, listing (actives/historique), escalade, changement de statut et résolution des alertes sécurité de la cité.
- `incident`: Signalement, listing/détail, likes et commentaires hiérarchisés sur les incidents de la cité.
- `conflit`: Déclaration, lecture (own/all), prise en charge, résolution et notes syndic sur les conflits.
- `annonce`: Création, lecture, édition, suppression et épinglage des annonces de la cité.

### Modified Capabilities
<!-- Aucune spec existante pour ces modules — new capabilities côté repo -->

## Impact

- `src/modules/` : 4 nouveaux modules (`alerte/`, `incident/`, `conflit/`, `annonce/`), DTO + controller + service générés puis adaptés (workflow, likes, commentaires).
- Prisma : modèles déjà présents (`alerte_securite`, `incident`, `incident_like`, `incident_commentaire`, `conflit`, `annonce`) — exécuter `prisma generate` si mapping relation manquant.
- RBAC : features seedées (ALERTE_*, INCIDENT_*, CONFLIT_*, ANNONCE_*) déjà présentes dans `profil_feature`.
- `app.module.ts` : enregistrer les 4 modules.
- Tests e2e : ajouter suites par module (scoping cité, features, workflow).