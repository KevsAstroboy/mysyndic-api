## Why

Le backend MySyndic n'a pour l'instant que le schéma SQL (`init-scripts/mysyndic_db.sql`, validé de zéro). Aucune API NestJS n'existe encore. On démarre la construction du backend sur ce schéma (source de vérité) en suivant l'optique éprouvée d'aff-api : Prisma (db pull), Redis sessions + RBAC cached, MinIO en dev, docker-compose complet.

## What Changes

- Scaffold NestJS 10 (TypeScript strict) côté racine du projet, config TypeORM abandonnée au profit de **Prisma** (db pull depuis le SQL existant, `prisma-sync` réutilisé).
- Infra docker-compose : postgres 16 + mongo 7 + redis 7 + minio + api (volume-mounted dev) + prisma-sync.
- Socle commun repris d'aff-api : modules globaux (prisma, redis, mail, storage/MinIO), `common/criteria`, `global-exception.filter`, `date-format.interceptor`, `authenticated-request.interface`.
- Couches multi-tenant & sécurité propres à MySyndic : decorator + interceptor cite_id (R1), guard `must_change_password` (R3), guard RBAC Redis avec staleness via versioning profil_features, interceptor audit_log (R9), procédures SQL appelées via raw (`add_user_to_cite_groupe` R8).
- Modules Sprint 1 : **auth** (register/login/refresh/change-password/forgot/reset/logout, JWT payload avec `cite_id` + `must_change_password`), **cite** (CRUD Super Admin, transaction cité+groupe+configuration+audit R8), **villa** (CRUD + assign/unassign, transaction user_villa is_current), **user** (création staff avec mdp temporaire + email + must_change_password, activation/désactivation, /users/me), **configuration** (GET/PATCH par cité).
- Scripts : `generate-module.ts` + templates hbs adaptés (UUID, scoping cite_id).
- Tests e2e auth (supertest, DB `mysyndic_test`) + Jest configuré. Swagger.
- Aucune breaking change : rien n'existe côté applicatif aujourd'hui.

## Capabilities

### New Capabilities

- `auth`: inscription habitant, login, refresh token, changement/réinitialisation de mot de passe, logout, JWT payload (sub, email, role, cite_id, must_change_password), sessions Redis, guards foi
- `cite-management`: CRUD cités Super Admin, transaction de création (groupe_cite auto, configuration par défaut, audit_log)
- `villa-management`: CRUD villas, assignation/désassignation user↔villa avec désactivation de la villa courante
- `user-management`: profil connecté, création staff (mdp temporaire + email + must_change_password), activation/désactivation, ajout auto au groupe de cité
- `configuration-management`: lecture/mise à jour de la configuration d'une cité (paystack, cotisation, lien Wave)

### Modified Capabilities

## Impact

- **Code** : racine entière du projet `mysyndic-api` (aucun code app existant) — Scaffold NestJS, src modules, common, scripts, prisma, test.
- **DB** : aucun changement de schéma — SQL existant réutilisé tel quel, Prisma généré par db pull. Ajout de la DB de test `mysyndic_test` au boot.
- **Dépendances** : NestJS 10, Prisma, Mongoose (MessageSprintTable future, module mongo dès le socle), Redis (ioredis), MinIO (dev), Nodemailer, Jest/Supertest, class-validator/transformer, Swagger.
- **Systèmes** : docker-compose (nouveaux services postgres16/mongo7/redis7/minio/api/prisma-sync), ports 5432/27017/6379/9000-9001/3000.