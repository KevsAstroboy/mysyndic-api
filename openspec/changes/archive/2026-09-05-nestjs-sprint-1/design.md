## Context

MySyndic : backend de gestion de cité résidentielle multi-tenant (marché ivoirien, déploiement Synacassy 1). Le schéma PostgreSQL v3 existe et est validé (`init-scripts/mysyndic_db.sql`) : 40 tables, UUID PK, views, procédures, RBAC versionné, seeds. Aucun code applicatif n'existe côté racine `mysyndic-api`.

Référence d'architecture : `aff-api` (projet sibling) — NestJS 10, Prisma (db pull depuis SQL), Redis pour sessions + RBAC cached, MinIO pour fichiers, docker-compose dev, générateur de modules CRUD, criteria parser/builder. On reproduit cette optique.

## Goals / Non-Goals

**Goals**
- Backend NestJS 10 exécutable de zéro via docker-compose, sur le SQL existant (source de vérité, non modifié).
- Socle multi-tenant : cite_id injecté depuis JWT (R1), MustChangePasswordGuard (R3), RBAC Redis avec invalidation par version (R10), audit interceptor (R9).
- Modules Sprint 1 fonctionnels : auth, cite, villa, user, configuration.
- Testable : e2e auth sur DB dédiée `mysyndic_test`.

**Non-Goals**
- Paiement/webhook, alerte+escalade cron, incident, conflit (double DTO), annonce, message PG+Mongo+Redis, document, notification, audit dashboard — sprints suivants.
- Modification du schéma SQL. Pas de migration de données.

## Decisions

### D1. ORM : Prisma (pas TypeORM)
SQL écrit à la main = source de vérité. `prisma db pull` régénère le schéma Prisma, éliminant toute dérive DDL. aff-api a déjà ce pipeline (service `prisma-sync`). TypeORM exigerait de réécrire tout le DDL en entities TS (duplication, perte).
- **Views** : models Prisma en lecture seule (ex. `v_impayes_mois_courant`, `v_recouvrement_mensuel`). Consultées via prisma client, jamais écrites.
- **Generated column** `webhook.montant_match` : lue via Prisma, non écrite.
- **Procédures** (`add_user_to_cite_groupe`, `snapshot_profil_features`, `escalade_alertes_non_traitees`, `cleanup_expired_otps`) : `$executeRawUnsafe('CALL …')`.
- **UUID** : `@db.Uuid` natif.
- Handshake rejeté : TypeORM.

### D2. Storage fichiers : MinIO en dev (abstraction S3)
aff-api utilise MinIO (S3-compatible) local. Service `StorageService` encapsule le client; en prod le swap Supabase se fait par implémentation de l'interface (même contrat `uploadFile/uploadBase64/getPresignedUrl/deleteFile`). Config portée par env `MINIO_*`.

### D3. Sessions Redis + RBAC cached (motif aff-api)
Au login, `computeSession` charge profils+features (vue/v_profil_features) et les stocke `session:{user_id}` avec `features_version` par profil. `RbacGuard` lit Redis, vérifie la staleness par comparaison de versions (comme aff-api `isSessionStale`). Pas de hit DB par requête.

### D4. JWT payload MySyndic
`{ sub, email, role, cite_id, must_change_password, iat, exp }`. `cite_id` null pour SUPER_ADMIN. Un ecart vs aff-api : champ multi-tenant ajouté au payload et à la session Redis.

### D5. Scoping cite_id : decorator + interceptor, pas service helper seul
Spec R1 : « couche service centrale ». On combine : `@CiteId()` decorator (lit JWT) + injection systématique dans les queries Prisma. Pour les modules CRUD générés, le générateur ajoute le filtre `cite_id` par défaut. Ouverture Super Admin : si `cite_id` JWT null, requête non filtrée.

### D6. Générateur de modules : adapter aff-api
Copie de `scripts/generate-module.ts` + templates hbs, adaptés : UUID au lieu d'Int, colonne `cite_id` scoping, `created_by/updated_by` depuis JWT, feature code conservé (`GERER_*`).

### D7. Docker-compose dev (motif aff-api)
Services : postgres16 (init-scripts montés via `docker-entrypoint-initdb.d`), mongo7, redis7, minio, api (volume-mount, `npm run start:dev`), prisma-sync (profiles: setup).
- DB de test `mysyndic_test` créée au boot postgres (script init additionnel).
- Ports réutilisés aff-api (5432/27017/6379/9000/9001) — déjà en place sur la machine (conteneur `nyuman-api-postgres-1`; utiliser des ports dédiés si conflit : éditer compose).

### D8. Auth e2e (test DB)
Jest + Supertest, DB `mysyndic_test` non destructive : `truncate` sélectif + reseed minimal par suite. Couverture d'abord sur auth (login/register/refresh/change-pw/guards), pas de seuils bloquants pour les autres modules au Sprint 1 (décision alignée aff-api).

## Risks / Trade-offs

- **Conflit ports docker** (5432 déjà occupé) → Mitigation : ports dédiés MySyndic (55432/55433…) ou arrêt des services conflicts; validation par `docker ps` avant `up`.
- **Prisma et views/procédures** : certaines vues peuvent générer des models sans PK Prisma intégrable → Mitigation : `@@ignore` sur models non requis au Sprint 1, ou `@@unique` explicite si colonne clé dispo.
- **Staleness RBAC** : rafraîchissement de session si version décalée → cycle invalidation accepté (same as aff-api).
- **Struct base nuclei** : aff-api n'a pas multi-tenant; les guards/helpers cite_id écrits neufs, à tester au sprint 1 (e2e auth). Risque baseline → e2e covers cité scoping sur auth uniquement pour l'instant ; user/cite scoping sera couvert pas e2e au sprint 2.
- **Audit interceptor**: modèle `AuditLogInterceptor` encommun (R9) — typé neutre pour MarchSprintTable 2; activation progressive module par module.

## Migration Plan

1. `docker compose up -d postgres` → schéma + seeds appliqués (idempotent), DB `mysyndic_test` créée.
2. `prisma db pull` → `schema.prisma` généré (service prisma-sync ou manuel).
3. `npm install` + build + tests e2e.
4. Rollback : detruire volumes compose, re-executer SQL idempotent. Pas de migration progressive (greenfield).

## Open Questions

- Ports définitifs pour les containers MySyndic (selon occupation machine) — résolu au moment du `docker compose up`.
- Sélection des views à exposer en models Prisma dès le Sprint 1 (auth n'en a pas besoin; configuration en dépend) — tranché pendant le `db pull` et retouché du prisma/schema.