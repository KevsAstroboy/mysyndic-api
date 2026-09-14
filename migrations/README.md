# Migrations SQL versionnées

## Rôle

Dossier des migrations SQL **versionnées**, appliquées automatiquement au
démarrage de l'API (`MigrationService.onApplicationBootstrap`, enregistré dans
`AppModule`) **et** à la demande via `npm run migrate:run`.

Pourquoi : `init-scripts/mysyndic_db.sql` n'est exécuté qu'**une seule fois**,
à la création du volume BDD (`/docker-entrypoint-initdb.d`). Sur une base
**existante** (re-créée, partagée, prod, test), rien n'est appliqué
automatiquement. Les migrations résolvent ça : à chaque démarrage, l'API
applique les fichiers `.sql` non encore enregistrés dans `schema_migrations`.

`prisma db pull` resynchronise `prisma/schema.prisma`.

## Fichiers

Format : `NNNN_description.sql` où `NNNN` est un numéro de version à 4 chiffres.

```
migrations/
  README.md
  0001_nouvelle_table.sql
  0002_maj_colonne_existante.sql
```

Règles :
- Un fichier = **un changement de schéma**, exécuté **une seule fois**, dans
  l'ordre numérique.
- **Ne jamais modifier une migration déjà appliquée en prod.** Nouveau
  changement → nouveau numéro (`0002`, `0003`, …).
- Une migration peut contenir plusieurs instructions SQL ; elle est exécutée
  en **une transaction**. Idempotence recommandée :
  `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`,
  `INSERT ... ON CONFLICT DO NOTHING`.

## Table schema_migrations

Postgres mémorise ce qui est déjà appliqué (créée automatiquement par le
runner) :

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
    version    VARCHAR(50) PRIMARY KEY,   -- "0001"
    filename   VARCHAR(255) NOT NULL,     -- "0001_nouvelle_table.sql"
    applied_at TIMESTAMP NOT NULL DEFAULT now()
);
```

À chaque démarrage / `migrate:run` :
1. la table est créée si absente ;
2. les fichiers `migrations/*.sql` sont listés, triés par numéro ;
3. chaque fichier dont la version n'est pas dans `schema_migrations` est
   exécuté puis enregistré (`applied_at`) ;
4. logs : `Applied migration 0001_...` ou `No migrations to apply`.

Désactivation du boot : `RUN_MIGRATIONS_ON_BOOT=false` (préférer alors
`npm run migrate:run` en prod/CI).

## Protocole pour les développeurs

- **Base vierge** (nouvelle install, volume BDD vide) : le schéma complet reste
  géré par `init-scripts/mysyndic_db.sql` (création + référentiels + seed de
  démo). Ne pas dupliquer la création de ces tables dans `migrations/`.
- **Base existante** (prod, partagée, test e2e) : tout `ALTER TABLE` / nouveau
  champ / contrainte / nouvelle table vient dans un **nouveau** fichier
  `migrations/NNNN_description.sql`.
- Bon réflexe : à chaque changement de schéma, l'ajouter **aussi** dans
  `init-scripts/mysyndic_db.sql` (pour les futures bases vierges) **ET** dans
  une migration (pour les bases existantes).
- Après une migration qui change le schéma, resynchroniser le client Prisma :
  `npm run db:sync` (`prisma db pull` + `prisma generate`). Le modèle
  `schema_migrations` généré par le pull est de gestion — le marquer `@@ignore`
  dans `prisma/schema.prisma` (comme les vues en lecture seule).

## Seeds / données de référence

- **Lié à un changement de schéma** (nouveau statut, nouvelle config, nouvelles
  lignes de référence pour une table créée par la migration) : l'inclure dans
  la migration elle-même, en idempotent (`INSERT ... ON CONFLICT DO NOTHING`).
- **Données applicatives / démo** (mots de passe, fixtures de test) : en TS,
  `npm run seed` (`scripts/seed-demo.ts`).

## Vérifier l'état

```sql
SELECT version, filename, applied_at FROM schema_migrations ORDER BY version;
```

## Notes techniques

- Runner : `src/prisma/migration-runner.ts` (lib). Utilise `pg` (connexion
  **synchrone**) car Prisma `$executeRaw` ne déroule pas les scripts
  multi-commandes de façon fiable. Même composant partagé par le boot API et le
  CLI `scripts/run-migrations.ts`.
- Retry avec backoff au premier boot (Postgres peut ne pas être encore prêt).
- Cible : `options.databaseUrl` si fournie, sinon `TEST_DATABASE_URL` (tests e2e),
  sinon `DATABASE_URL`. L'API en `NODE_ENV=test` est donc branchée sur la base
  de test automatiquement.