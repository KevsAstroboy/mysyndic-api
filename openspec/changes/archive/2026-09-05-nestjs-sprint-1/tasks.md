## 1. Infra & Scaffold

- [x] 1.1 Créer `package.json` (NestJS 10, deps aff-api : prisma, bcryptjs, class-validator/transformer, ioredis, jwt, validators, supertest dev, jest, ts-jest, swagger)
- [x] 1.2 Copier config nest (`nest-cli.json`, `tsconfig.json`, `tsconfig.build.json`) depuis aff-api, adapter outDir
- [x] 1.3 Écrire `docker-compose.yml` (postgres16 + mongo7 + redis7 + minio + api + prisma-sync, patterns aff-api) ; ports MySyndic dédiés si conflit machine
- [x] 1.4 Écrire `init-scripts/init-test-db.sh` (création DB `mysyndic_test` au boot PG) ; monter init-scripts existant dans entrypoint
- [x] 1.5 Écrire `.env.example` (POSTGRES, DATABASE_URL, MONGO, REDIS, MINIO, JWT, MAIL, PORT) — copier/ajuster aff-api
- [x] 1.6 Créer `src/main.ts` : ValidationPipe whitelist+forbidNonWhitelisted+transform, CORS, global prefix `api`, Swagger, global filter + interceptors
- [x] 1.7 Créer `src/app.module.ts` : ConfigModule global + modules globaux + modules de domaine

## 2. Base de données (Prisma)

- [x] 2.1 `npm install` (racine), installer prisma + @prisma/client
- [x] 2.2 Démarrer postgres compose, laisser init-scripts appliquer schéma+seeds (idempotent)
- [x] 2.3 `prisma db pull` depuis DATABASE_URL → générer `prisma/schema.prisma`
- [x] 2.4 Retoucher schema.prisma : uuid @db.Uuid, views pertinentes (v_impayes_mois_courant, v_recouvrement_mensuel) en models readonly, `@@ignore` les modèles non requis Sprint 1
- [x] 2.5 `prisma generate` ; créer `src/prisma/prisma.module.ts` + `prisma.service.ts` (global, OnModuleInit connect)
- [x] 2.6 Valider : service prisma-sync (ou manuel) régénère sans erreur, migration diff vide vs SQL source

## 3. Socle commun (réutilisé aff-api)

- [x] 3.1 Créer `src/redis/redis.module.ts` (global, provider `REDIS_CLIENT` ioredis depuis REDIS_URL)
- [x] 3.2 Créer `src/mail/mail.module.ts` + `src/mail/mail.service.ts` (Nodemailer, config SMTP)
- [x] 3.3 Créer `src/storage/storage.service.ts` + module (MinIO : uploadFile/uploadBase64/getPresignedUrl/deleteFile, ensureBucket) — copié aff-api, adapter config MINIO_*
- [x] 3.4 Copier `common/criteria` (types, parser, builder, helpers) depuis aff-api
- [x] 3.5 Créer `common/filters/global-exception.filter.ts` et `common/interceptors/date-format.interceptor.ts` (adaptés aff-api)
- [x] 3.6 Créer `common/types/authenticated-request.interface.ts` + `jwt-payload.interface.ts` (sub, email, role, cite_id, must_change_password)

## 4. Guards, decorators, interceptors MySyndic

- [x] 4.1 Créer `common/decorators/cite-id.decorator.ts` (lit cite_id du JWT) et `current-user.decorator.ts`
- [x] 4.2 Créer `common/decorators/feature.decorator.ts` (`@RequireFeature('…')`) + clé Reflector
- [x] 4.3 Créer `common/guards/jwt-auth.guard.ts` (passport-jwt / @nestjs/jwt)
- [x] 4.4 Créer `common/guards/rbac.guard.ts` : lit session Redis, staleness features_version, 403 si feature absente (R10)
- [x] 4.5 Créer `common/guards/must-change-password.guard.ts` : bloque toutes routes sauf POST /auth/change-password si must_change_password (R3)
- [x] 4.6 Créer `common/interceptors/cite-filter.interceptor.ts` (injecte cite_id dans les queries) et `audit-log.interceptor.ts` (R9, journalise mutations)

## 5. Module Auth

- [x] 5.1 DTOs : register (villa_id/uuid), login (email|telephone, mdp), change-password, forgot-password, reset-password (otp)
- [x] 5.2 `auth.service.ts` : register (transaction user + user_villa + CALL add_user_to_cite_groupe + audit, R8/R9), login (bcrypt + buildAuthResponse)
- [x] 5.3 Session Redis : `computeSession` (profils + features + features_version via profils) + `refreshSession`/`getSession` (clé `session:{user_id}`, TTL REDIS_SESSION_TTL_SECONDS)
- [x] 5.4 JWT : stratégie (payload {sub,email,role,cite_id,must_change_password}), sign access + refresh, refresh token Redis `refresh:{user_id}`
- [x] 5.5 change-password (hash bcrypt 12, reset must_change_password) ; audit ACTION
- [x] 5.6 forgot-password / reset-password : OTP en table otp (contexte), envoi email, anti-enumeration réponse générique
- [x] 5.7 logout : delete session Redis + audit LOGOUT
- [x] 5.8 Filtrage rôle/cité : rôle unique (profil) dans la réponse login ; SUPER_ADMIN cite_id null
- [x] 5.9 `auth.controller.ts` : routes spec (register/login/refresh/change-password/forgot/reset/logout), guards appliqués, Swagger complet

## 6. Module Cité

- [x] 6.1 `cite.service.ts` : transaction création (cite + groupe_cite "Chat {nom}" + configuration défaut + audit, R8) ; list avec stats agrégées ; get/patch ; scoping SUPER_ADMIN (cite_id null)
- [x] 6.2 `cite.controller.ts` : GET /cites, POST (SA_CREATE_CITE), GET /cites/:id, PATCH (SA_READ_ALL_CITES) + Swagger
- [x] 6.3 Vérif doublon nom → 409

## 7. Module Villa

- [x] 7.1 `villa.service.ts` : CRUD scoping cite_id ; vérif UNIQUE(cite_id, numero) → 409 ; get détail avec occupants (user_villa is_current) + historique paiements
- [x] 7.2 assign-user : transaction ancienne villa → FALSE, nouvelle is_current TRUE, audit (R6) ; cross-cité → 403
- [x] 7.3 unassign-user : user_villa courante → FALSE + audit
- [x] 7.4 `villa.controller.ts` : endpoints spec + guards (HABITANT_UPDATE_VILLA, HABITANT_READ) + Swagger

## 8. Module User

- [x] 8.1 `user.service.ts` : GET /users (liste cité), GET /users/:id, PATCH /users/:id (self non sensibilia), GET /users/me (user + villa courante + cite)
- [x] 8.2 Création staff : mdp temporaire (12 chars regex-safe), bcrypt 12, must_change_password=TRUE, CALL add_user_to_cite_groupe, email Nodemailer, audit (feature ADMIN_CREATE_STAFF)
- [x] 8.3 activate/deactivate : is_active toggle + invalidation session Redis (feature ADMIN_DEACTIVATE_USER)
- [x] 8.4 `user.controller.ts` : endpoints + guards + Swagger

## 9. Module Configuration

- [x] 9.1 `configuration.service.ts` : GET (masque clés secrètes partiellement, scoping cité), PATCH (ADMIN_CONFIG_CITE) validation subaccount SIMPLE/SPLIT + split 1-100 + audit
- [x] 9.2 `configuration.controller.ts` : GET /configuration, PATCH + Swagger

## 10. Générateur de modules (adaptation aff-api)

- [x] 10.1 Copier `scripts/generate-module.ts` + templates hbs depuis aff-api
- [x] 10.2 Adapter : colonnes UUID, injection cite_id par défaut, created_by/updated_by depuis JWT, feature code `GERER_*`
- [x] 10.3 Test --dry-run sur un modèle (ex. configuration) sans écriture destructive

## 11. Tests & Validation

- [x] 11.1 Config Jest (unit + e2e) ; DB de test `mysyndic_test` : helper truncate sélectif + reseed minimal
- [x] 11.2 e2e auth : register (201/400/409), login (200/401/user désactivé), change-password (200/400 bloquage 403 MUST_CHANGE_PASSWORD), refresh, guards 401/403
- [x] 11.3 e2e cité : SUPER_ADMIN create/list, ADMIN 403, doublon 409
- [x] 11.4 e2e villa : doublon numero 409, assign transaction (ancienne désactivée), cross-cité 403
- [x] 11.5 e2e user : /users/me, staff créé avec mdp temp + must_change_password, activate/deactivate refusé à la connexion
- [x] 11.6 e2e configuration : GET masqué, PATCH split invalide 400, feature manquante 403
- [x] 11.7 Lint (eslint), build (nest build), suite complète verte
- [x] 11.8 Boot docker compose complet (api + dépendances), smoke test endpoints, teardown propre
