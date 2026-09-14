## 1. Socle socket.io + NotifService enrichi

- [x] 1.1 Ajouter devDep `socket.io-client` (tests e2e gateway)
- [x] 1.2 Créer `src/message/message-content.service.ts` (driver Mongo : connect mongoose, collection `MONGO_MSG_COLLECTION`, insert/get document par `mongo_doc_id`)
- [x] 1.3 Créer `src/sockets/sockets.module.ts` + `chat.gateway.ts` (`@WebSocketGateway`) : auth par JWT handshake, rooms `user:{userId}` / `cite:{citeId}`, adapter Redis (`@socket.io/redis-adapter` via `REDIS_CLIENT`) avec fallback simple
- [x] 1.4 Étendre `NotifService` : `sendToUser` émet socket `notification:new` vers `user:{userId}` en plus de l'insert PG
- [x] 1.5 Étendre `NotifService` : `sendToCite(cite_id, titre, message, { features?, exceptUserId? })` — requête profils actifs + `profil_feature`, crée 1 notification par ciblé et émet socket
- [x] 1.6 Brancher `SocketsModule` + adapter socket.io dans `main.ts` (Redis adapter) ; enregistrer modules dans `app.module.ts`

## 2. Messagerie — module HTTP + socket

- [x] 2.1 DTO : `SendPrivateMessageDto` (destinataire_id, contenu), `SendGroupeMessageDto` (contenu), routes prefix `/messages`
- [x] 2.2 Service : `sendPrivate` (check destinataire même cité → 400 sinon, métadonnées PG `est_groupe=false` + contenu Mongo, emit socket `message:new`)
- [x] 2.3 Service : `sendGroupe` (upsert `groupe_cite` de la cité, PG `est_groupe=true` + contenu Mongo, emit socket room `cite:{citeId}`)
- [x] 2.4 Service : `getConversations` (threads privés + groupe, last message + non-lus Redis), `getThread(userId)` (pagination, horodatage, flag lu)
- [x] 2.5 Service : `markRead` (Redis ZSET `msg:read:{userId}`, 403 si ni destinataire ni expéditeur), `removeMessage` (soft-delete, 403 si pas expéditeur)
- [x] 2.6 Controller : `GET /messages/conversations`, `GET /messages/conversations/:userId`, `POST /messages/private` (feature `MESSAGE_SEND_PRIVATE`), `POST /messages/groupe` (feature `MESSAGE_SEND_GROUPE`), `PATCH /messages/:id/lu`, `DELETE /messages/:id` (feature `MESSAGE_DELETE_OWN`) + scoping `cite_id`

## 3. Documents — upload MinIO + métadonnées PG

- [x] 3.1 DTO/config : taille max upload, résolution `type_document` par extension
- [x] 3.2 Service : `upload` (multipart → `StorageService.uploadFile` bucket `MINIO_BUCKET_DOCUMENTS`, create `document` : titre, type_id, taille_ko, file_path, auteur, cité)
- [x] 3.3 Service : `findAll` (cité, date desc, hors soft-delete), `download(id)` (URL pré-signée, 404 hors cité/supprimé), `remove` (soft-delete, 404 hors cité)
- [x] 3.4 Controller : `GET /documents` (feature `DOCUMENT_READ`), `POST /documents` (feature `DOCUMENT_UPLOAD`), `GET /documents/:id/download` (feature `DOCUMENT_READ`), `DELETE /documents/:id` (feature `DOCUMENT_DELETE`) + scoping `cite_id`

## 4. Notifications — HTTP (badge, liste, marquage lu)

- [x] 4.1 Controller : `GET /notifications` (scoped user + cité, date desc), `GET /notifications/badge` (count `lu=false`), `PATCH /notifications/:id/lu` (404 si pas à l'user), `PATCH /notifications/read-all`
- [x] 4.2 Brancher notifications existantes sur `sendToCite`/`sendToUser` ciblés : annonce nouvellement créée → occupants ; alerte créée/escaladée → syndics (features `ALERTE_UPDATE_STATUT`) ; incident signalé → syndics ; commentaire/like incident → auteur ; conflit prise en charge/statut → déclarant ; message privé → destinataire
- [x] 4.3 Vérifier que les notifications déjà émises (sprint 2/3 via `sendToUser`/`sendToCiteOccupants`) restent compatibles (même insert PG + socket)

## 5. Tests e2e + build

- [x] 5.1 `test/message.e2e-spec.ts` : envoi privé (200 + message créé), destinataire hors cité → 400, sans feature → 403, historique scoped, markRead, delete own (200) / delete d'autrui (403)
- [x] 5.2 `test/document.e2e-spec.ts` : upload (200 + ligne document), sans feature → 403, liste cité, download presigned, delete (200) puis liste vide, delete hors cité → 404
- [x] 5.3 `test/notification.e2e-spec.ts` : badge, liste, mark lu (200, badge décroît), read-all, notification d'autrui → 404, ciblage syndics via `sendToCite` (optionnel : test unitaire service)
- [x] 5.4 Écrire une spec socket (client `socket.io-client`) : connexion avec token JWT, réception `message:new` en room user, refus sans token
- [x] 5.5 `npx prisma generate` si besoin + `nest build` 0 erreur, suite complète e2e verte (non-régression sprint-1/2/3 + nouveaux)