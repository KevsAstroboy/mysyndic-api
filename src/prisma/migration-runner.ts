import { existsSync } from 'fs';
import { readdir, readFile } from 'fs/promises';
import { Pool } from 'pg';
import * as path from 'path';

export interface MigrationResult {
  /** Fichiers appliqués dans cet appel, dans l'ordre numérique. */
  applied: string[];
  /** Fichiers déjà enregistrés dans schema_migrations (rejoués / manquants). */
  skipped: string[];
  /** Dossier migrations résolu (null si introuvable). */
  migrationsDir: string | null;
  /** true si la table schema_migrations a été créée/créée (ou existait). */
  tableCreated: boolean;
}

export interface MigrationOptions {
  /** Chemin du dossier migrations. Défaut : résolu (./migrations puis relatif au module). */
  migrationsDir?: string;
  /** URL de connexion Postgres. Défaut : TEST_DATABASE_URL (NODE_ENV=test) sinon DATABASE_URL. */
  databaseUrl?: string;
  /** Nombre de tentatives (retry backoff au premier boot). Défaut : 5. */
  retries?: number;
  /** Délai initial entre tentatives (ms). Défaut : 2000. */
  delayMs?: number;
  /** Fonction de log. Défaut : console.log. */
  log?: (message: string) => void;
}

const SCHEMA_MIGRATIONS_DDL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version   VARCHAR(50) PRIMARY KEY,
  filename  VARCHAR(255) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT now()
);
`;

function defaultLog(message: string): void {
  // eslint-disable-next-line no-console
  console.log(message);
}

function resolveMigrationsDir(custom?: string): string | null {
  if (custom) return custom;
  const fromCwd = path.resolve(process.cwd(), 'migrations');
  if (existsSync(fromCwd)) return fromCwd;
  const relative = path.resolve(__dirname, '../../migrations');
  if (existsSync(relative)) return relative;
  return null;
}

async function listMigrationFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir);
  return entries
    .filter((name) => /^\d/.test(name) && name.endsWith('.sql'))
    .sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }),
    );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runner de migrations SQL versionnées (motif nyuman-api).
 *
 * Conventions :
 * - lit les fichiers NNNN_description.sql triés par numéro ;
 * - exécute chaque fichier non encore enregistré dans une transaction,
 *   puis enregistre (version, filename, applied_at) ;
 * - idempotent : un fichier déjà appliqué n'est jamais rejoué.
 *
 * Le nom du dossier reste configurable : les tests e2e, le CLI et le boot API
 * partagent le même runner.
 */
export class MigrationRunner {
  static async run(options: MigrationOptions = {}): Promise<MigrationResult> {
    const log = options.log ?? defaultLog;
    const migrationsDir = resolveMigrationsDir(options.migrationsDir);

    const result: MigrationResult = {
      applied: [],
      skipped: [],
      migrationsDir,
      tableCreated: false,
    };

    if (!migrationsDir || !existsSync(migrationsDir)) {
      log(`Migrations directory not found: ${migrationsDir ?? '(undefined)'}`);
      return result;
    }

    const files = await listMigrationFiles(migrationsDir);
    if (files.length === 0) {
      log('No SQL migration files found');
      return result;
    }

    const databaseUrl =
      options.databaseUrl ??
      process.env.TEST_DATABASE_URL ??
      process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error('DATABASE_URL non défini — impossible d’exécuter les migrations');
    }

    const pool = new Pool({ connectionString: databaseUrl });
    const retries = options.retries ?? 5;
    const delayMs = options.delayMs ?? 2000;

    let lastError: unknown;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        const bootClient = await pool.connect();
        try {
          await bootClient.query(SCHEMA_MIGRATIONS_DDL);
          result.tableCreated = true;
        } finally {
          bootClient.release();
        }

        const { rows } = await pool.query<{ version: string }>(
          'SELECT version FROM schema_migrations',
        );
        const appliedSet = new Set(rows.map((r) => r.version));

        for (const filename of files) {
          const version = filename.split('_', 1)[0];
          if (appliedSet.has(version)) {
            result.skipped.push(filename);
            continue;
          }
          const script = await readFile(path.join(migrationsDir, filename), 'utf8');
          const client = await pool.connect();
          try {
            await client.query('BEGIN');
            await client.query(script);
            await client.query(
              'INSERT INTO schema_migrations (version, filename) VALUES ($1, $2)',
              [version, filename],
            );
            await client.query('COMMIT');
            result.applied.push(filename);
            log(`Applied migration ${filename}`);
          } catch (err) {
            await client.query('ROLLBACK');
            throw err;
          } finally {
            client.release();
          }
        }

        if (result.applied.length === 0) {
          log('No migrations to apply');
        }
        return result;
      } catch (err) {
        lastError = err;
        log(
          `Migration attempt ${attempt}/${retries} failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        if (attempt < retries) {
          await sleep(delayMs * attempt);
        }
      }
    }

    throw lastError;
  }
}