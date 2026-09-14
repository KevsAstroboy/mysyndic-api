## Why

Sprint-3 a fourni sécurité/communication async (alertes, incidents, conflits, annonces) mais le MVP reste sans échanges directs entre habitants ni partage de fichiers : pas de messagerie temps réel, pas de documents, et les notifications ne sont que des insertions DB silencieuses via `NotifService` (sprint 2). Sprint-4 livre la messagerie privée/groupe temps réel (socket.io), la gestion des documents (MinIO) et un vrai moteur de notifications (badges, marquage lu, push socket).

## What Changes

- **Messagerie temps réel** : gateway socket.io (`@nestjs/platform-socket.io` + adapter Redis multi-instance), groupe de cité auto-créé + inscription automatique des habitants (`add_user_to_cite_groupe`), messages privés (1-1) et groupe (cité entière), métadonnées en `message` (PG), contenu stocké dans MongoDB (`MONGO_MSG_COLLECTION` via `mongo_doc_id`), état lu/non-lu en Redis (`REDIS_MSG_LU_TTL_DAYS`).
- **Documents** : upload fichier → MinIO bucket documents, métadonnées en `document` (PG, `type_id`/`taille_ko`/`file_path`), liste de la cité, download via URL pré-signée, soft-delete. Features RBAC `DOCUMENT_READ`/`DOCUMENT_UPLOAD`/`DOCUMENT_DELETE` (HABITANT : read ; SYNDIC/ADMIN : read+upload+delete).
- **Notifications** : enrichissement `NotifService` — `sendToCite` avec ciblage précis (occupants, syndics, utilisateur), émission socket événement `notification:new`, endpoint list/badge non-lus/marquer lu. Branchement sur les événements existants : alias, incidents, conflits, annonces, messages.
- **Features RBAC** (`MESSAGE_SEND_PRIVATE`, `MESSAGE_SEND_GROUPE`, `MESSAGE_DELETE_OWN`, `DOCUMENT_*`) déjà présentes dans le seed — réutilisées sans nouveau seed.
- Tout scoping `cite_id` conservé + soft-delete système sur message/document/notification.

## Capabilities

### New Capabilities
- `messagerie`: échanges privés et groupe temps réel (socket.io), conversation, lu/non-lu Redis, suppression de ses messages
- `document`: upload/liste/download/suppression des documents de la cité sur MinIO
- `notification`: moteur de notifications in-app — émission temps réel, badges, marquage lu, ciblage occupants/syndics

### Modified Capabilities
<!-- Existing specs (openspec/specs/) : paiement-webhook, paystack-subaccounts, alerte-securite, incident, conflit, annonce. Aucun requirement modifié — NotifService est un détail d'implémentation. -->

## Impact

- **Code** : nouveaux modules `src/modules/message/`, `src/modules/document/`, `src/modules/notification/` + gateway socket `src/sockets/` + enrichissement `src/common/services/notif.service.ts` + `main.ts` (adapter socket.io Redis) + `app.module.ts`.
- **Dépendances** : déjà présentes (socket.io, `@nestjs/platform-socket.io`, `@socket.io/redis-adapter`, `ioredis`) ; nouveau montage Mongoose pour le contenu des messages.
- **Infra** : Mongo (27018), Redis (6380), MinIO (9010) déjà dockerisés ; pas de changement de schéma Prisma (tables `message`, `document`, `notification`, `groupe_cite*` existantes).
- **API** : endpoints REST messagerie (conversations, historique, lu), documents (CRUD+download), notifications (GET non-lus, badge, PATCH lu) + namespace socket `chat`.
- **Tests** : specs e2e `message.e2e-spec.ts`, `document.e2e-spec.ts`, `notification.e2e-spec.ts` ; non-régression suite complète.