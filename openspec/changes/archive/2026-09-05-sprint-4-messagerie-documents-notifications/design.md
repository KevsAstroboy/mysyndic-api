## Context

L'API NestJS (`sprint-1`→`sprint-3`) gère auth JWT + RBAC versionné (features chargées dans Redis session pdt 24h), paiements, et sécurité/communication async (alertes, incidents, conflits, annonces). `NotifService` (CommonModule @Global) insère seulement des lignes `notification` via `sendToUser` / `sendToCiteOccupants`. Les tables `message`, `document`, `notification`, `groupe_cite`, `groupe_cite_membre` existent déjà en Prisma + SQL, seedées avec features RBAC (`MESSAGE_SEND_PRIVATE/GROUPE`, `MESSAGE_DELETE_OWN`, `DOCUMENT_READ/UPLOAD/DELETE`) et 11 types de notification. Mongo (27018, collection `messages` via `MONGO_MSG_COLLECTION`), Redis (6380, `REDIS_MSG_LU_TTL_DAYS=30`) et MinIO (9010, buckets) sont dockerisés. Dépendances socket.io (`@nestjs/platform-socket.io`, `@nestjs/websockets`, `socket.io`, `@socket.io/redis-adapter`, `ioredis`) déjà dans package.json.

## Goals / Non-Goals

**Goals:**
- Messagerie temps réel : privée (1-1) et groupe (cité entière), scoped `cite_id`, soft-delete, lu/non-lu Redis, historique paginé.
- Notification complète : `sendToCite` avec ciblage (occupants / syndics / utilisateur), badge non-lus, marquage lu, push socket `notification:new`.
- Documents : upload MinIO, métadonnées `document` (PG), liste cité, download URL pré-signée, soft-delete.
- RBAC réutilisé sur HTTP (guards existants) ; auth socket par JWT handshake.
- Tests e2e pour les 3 capabilities + non-régression suite complète.

**Non-Goals:**
- Pas de modération, pas de notifications push mobile (FCM/APNs), pas d'email hors scope (Gmail OTP déjà là, SMS désactivé MVP).
- Pas de fil d'Audit sprint-5, pas de signature/watermark documents.
- Pas de migration de schéma PG : tables existantes suffisent.
- Pas de pagination curseur poussée pour notifications (page offset simple OK).

## Decisions

1. **Gateway socket.io global `ChatGateway`** dans `src/sockets/` (module dédié `SocketsModule`), namespace par défaut, rooms : `user:{userId}` (privé) et `cite:{citeId}` (groupe). Adapter Redis (`@socket.io/redis-adapter`, pub/sub via `REDIS_CLIENT`) pour multi-instance. Auth : middleware guard qui parse `handshake.auth.token` (Bearer) via `jwt.verify` + charge la session Redis (features) ; toute non-authentification → `ConnectionRefusedError`. *Alternative rejetée* : réutiliser le guard HTTP Nest (pas adapté au cycle de vie socket).

2. **Contenu des messages en MongoDB, métadonnées en PG** — conforme au schéma : `message.mongo_doc_id` référence le doc `messages` ({ `message_id`, `contenu`, `type_document`, `created_at` }). PG porte `expediteur/gestinataire/groupe, cite_id, est_groupe`. *Alternative rejetée* : contenu en JSONB PG (`contenu TEXT`) — le schéma et la config `MONGO_MSG_COLLECTION` ont déjà tranché pour Mongo (volume chat, réactivité). Mongoose (`mongoose@8`) déjà dépendance.

3. **État lu/non-lu en Redis** (`REDIS_MSG_LU_TTL_DAYS=30`) sous clés `msg:read:{userId}` + score timestamp (ZSET). `GET /conversations/:userId` calcule non-lus par filtre. *Alternative* : flag PG sur `message` — rejetée, pas de colonne `lu` prévue ; Redis évite des UPDATE massifs.

4. **Privé vs groupe** : `est_groupe=true` + `groupe_id` (groupe de la cité, un seul — `groupe_cite.cite_id UNIQUE`) avec contrainte DB explicite ; `est_groupe=false` + `destinataire_id`. Groupe de cité auto-créé à l'init (upsert `groupe_cite` par cité) comme le prévoit `add_user_to_cite_groupe` du seed.

5. **Documents sur MinIO** via `StorageService` existant (`uploadFile`/`getPresignedUrl`), bucket résolu depuis `app_config MINIO_BUCKET_DOCUMENTS`. Upload multipart → `document` (titre, `type_id` selon extension via `type_document`, `taille_ko`, `file_path`), download → presigned. Scoping cité + feature RBAC.

6. **Notification ciblée** : extension `NotifService` — `sendToCite(cite_id, titre, message, {features?: string[], exceptUserId?})` requête les profils actifs des occupants (`user` + `user_profil` + `profil_feature`) puis `sendToUser` par cible ; émission `notification:new` vers `user:{userId}`. `sendToUser` garde son contrat actuel (retour `void`, catch silencieux).

7. **Contrats HTTP REST**, mirrors conventions sprint-3 :
   - `message` : `GET /api/messages/conversations`, `GET /api/messages/conversations/:userId`, `POST /api/messages/private` (→ `destinataire`), `POST /api/messages/groupe`, `PATCH /api/messages/:id/lu`, `DELETE /api/messages/:id`.
   - `document` : `GET /api/documents`, `POST /api/documents` (multipart `file`+`titre`), `GET /api/documents/:id/download`, `DELETE /api/documents/:id`.
   - `notification` : `GET /api/notifications`, `GET /api/notifications/badge`, `PATCH /api/notifications/:id/lu`, `PATCH /api/notifications/read-all`.
   - `POST /api/messages/*` + socket partagent le même service (métadonnées→PG, contenu→Mongo). Config `MONGO_MSG_COLLECTION` lue via ConfigService.

8. **Scoping cité systématique** : toutes requêtes message/document/notification filtrent `cite_id` de la session JWT (idem sprint-3) ; hors cité → 404/403. `cite_id` null (super admin) → 403.

9. **DTO whitelist stricts** (`whitelist:true` + `forbidNonWhitelisted:true` global déjà en place) : chaque champ reçu décoré en class-validator.

10. **Tests e2e** : ajout `socket.io-client` (devDep) pour le gateway. `setupTestApp()` (utils.e2e.ts) étendu : seed groupe cité + utilisateurs dest/cible. Suites `test/message.e2e-spec.ts`, `test/document.e2e-spec.ts`, `test/notification.e2e-spec.ts`.

## Risks / Trade-offs

- [Contenu Mongo hors transactions PG] → écrire Mongo en premier, signaler échec si insertion PG échoue (rollback best-effort + log) ; volume chat tolère l'asynchronicité.
- [Redis lu/non-lu éphémère (TTL 30j)] → acceptable, historique lu-non-lu court par design ; pagination du thread indépendante du flag.
- [socket.io-client absent] → ajout devDep ; tests gateway isolés pour ne pas bloquer la suite HTTP si socket down.
- [Upload taille/type] → limite 5–20 Mo (StorageService base64 limit déjà 5 Mo ; document accepté multipart jusqu'à config) + whitelist MIME via `type_document`.
- [Multi-instance rooms] → adapter Redis `@socket.io/redis-adapter` ; fallback single-node (adapter conditionnel selon `REDIS_URL`).