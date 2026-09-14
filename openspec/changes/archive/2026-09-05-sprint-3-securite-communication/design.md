## Context

Backend NestJS en sprints. Sprint 1 (auth/cite/villa/user/configuration) + sprint 2 (paiement/webhook) livrés, 40/40 e2e verts. Les tables `alerte_securite`, `incident` (+`incident_like`, `incident_commentaire`), `conflit`, `annonce` et leurs libellés (motif/statut/catégorie) existent déjà dans le DDL + Prisma. Les features RBAC correspondantes sont seedées par profil (ALERTE_*, INCIDENT_*, CONFLIT_*, ANNONCE_*). Le générateur `scripts/generate-module.ts` produit le CRUD de base avec scoping cité + soft-delete ; le travail de sprint-3 est de générer puis adapter pour les workflows métier.

## Goals / Non-Goals

**Goals:**
- Modules backend complets pour alerte, incident (+ like/commentaire), conflit, annonce.
- Reproduire le pattern des modules existants : `JwtAuthGuard` + `RbacGuard`, décorateur `@RequireFeature`, scoping `cite_id`, soft-delete.
- Workflows métier : escalade+résolution alerte, statuts conflit (pris en charge → résolu avec notes), épinglage annonce, likes + commentaires hiérarchisés (niveau 1/2) sur incident.
- Notifications in-app sur événements clés (alerte créée → syndics, incident résolu, conflit pris en charge/résolu) via `NotifService` existant.

**Non-Goals:**
- Upload réel de photos (alenre/photo_file_path, incident/photo_file_path) — exposé en champ texte (URL/chemin) uniquement ; MinIO média hors périmètre.
- Messagerie (sprint 4) et documents/notifications complet (sprint 4-5).
- Workflow multi-étapes configurable ; les statuts sont pilotés par les features + champs simples (escalade, pris_en_charge_at, resolu_at).

## Decisions

**D1 — Générateur + adaptation manuelle.** Générer les 4 modules via `scripts/generate-module.ts` (CRUD standard scoped + soft-delete), puis adapter à la main :
- `annonce` : le plus proche du généré (CRUD + `est_epinglee` en create/update). Restoration au min.
- `alerte` : workflow (create par habitant ; read active/history ; update statut/escalade par syndic ; resolution enregistre resolu_par+resolu_at).
- `incident` : create/read (+ likes, commentaires). Pas de soft-delete global exposé pour likes (table composite PK). Commentaires : `parent_id` + `niveau` (1 ou 2), validation niveau fils = parent+1, max 2.
- `conflit` : create (habitant, villa_declarant), read own/all, manage (prise en charge → resolu + notes).

Routes prévues (préfixes REST, scoping cité par défaut) :
- `GET/POST /alertes` , `GET /alertes/actives`, `GET /alertes/historique`, `PATCH /alertes/:id/statut`, `PATCH /alertes/:id/resoudre`
- `GET/POST /incidents`, `GET /incidents/:id` (détail + likes + commentaires arborescents), `POST /incidents/:id/like`, `DELETE /incidents/:id/like`, `POST /incidents/:id/commentaires`, `POST /incidents/:id/commentaires/:commentId/repondre`
- `GET/POST /conflits`, `GET /conflits/mes-conflits`, `PATCH /conflits/:id/prise-en-charge`, `PATCH /conflits/:id/resoudre`
- `GET/POST /annonces`, `PATCH /annonces/:id`, `DELETE /annonces/:id` (+ `est_epinglee`)

**D2 — RBAC + features.** Mapping route→feature :
- alerte : create=`ALERTE_CREATE` (habitant), actives=`ALERTE_READ_ACTIVE`, historique=`ALERTE_READ_HISTORY`, statut/escalade=`ALERTE_UPDATE_STATUT`, resoudre=`ALERTE_UPDATE_STATUT`.
- incident : create=`INCIDENT_CREATE`, read=`INCIDENT_READ`, like=`INCIDENT_LIKE`, commentaire=`INCIDENT_COMMENT` (validateur feature).
- conflit : create=`CONFLIT_CREATE`, own=`CONFLIT_READ_OWN`, all=`CONFLIT_READ_ALL`, prise en charge+resolution=`CONFLIT_MANAGE`.
- annonce : read=`ANNONCE_READ`, create=`ANNONCE_CREATE`, update=`ANNONCE_UPDATE`, delete=`ANNONCE_DELETE`.

La validation feature réelle est portée par le `RbacGuard` (cache Redis + profil_feature), le décorateur indique l'exigence.

**D3 — Config RBAC : `@RequireFeature` + guards.** Controllers en `@UseGuards(JwtAuthGuard, RbacGuard)` + `@ApiBearerAuth()`. Endpoints sensibles (prise en charge conflit, résolution, suppression annonce) vérifient en plus l'appartenance cité (scoping Prisma par `cite_id`).

**D4 — Sql relations/fk.** Vérifier la jointure via relations Prisma existantes (user, cite, villa, catégorie, statut, motif). Liste des détails inclut libellés (via `include`) pour lecture (noms motifs/statuts/catégories).

**D5 — Pattern DTO.** Un fichier `dto/<module>.dto.ts` par module, avec `class-validator` (Create/Update/Répondre/PrendreEnCharge/Resoudre). `id` de type string (UUID).

**D6 — Notifications.** `NotifService` (déjà présent, `sendToUser`) pour : création alerte → notifier les syndics de la cité ; conflit pris en charge/résolu → notifier le déclarant ; incident confirmé/résolu non applicable (pas de statut) → notifier à la création les syndics. Reste optionnel si le ciblage "par feature" n'est pas trivial — la priorité est le CRUD/workflow fonctionnel.

## Risks / Trade-offs

- Le générateur produit un CRUD générique ; le code d'adaptation (workflows, commentaires arborescents, likes composés, notifications) doit être écrit à la main → risque d'erreurs sur les jointures/relations Prisma. Mitigation : relire le schéma Prisma avant chaque service.
- `incident_like` n'a pas de soft-delete : un like est supprimé physiquement (`delete`), pas de `is_deleted`.
- Les notifications "aux syndics" nécessitent un ciblage par rôle/feature non encore implémenté dans NotifService (ciblage user direct uniquement). Trade-off : différer le ciblage groupe, ou envoyer aux `cite_id` mains les users de la cité avec feature syndic — à décider à l'implémentation.
- Photos MinIO non uploadées (hors périmètre) — le champ `photo_file_path` reste pilotable par le DTO (string), un futur sprint y branchera l'upload.

## Notifications

N/A — pas de chatter autour des artifacts OpenSpec.