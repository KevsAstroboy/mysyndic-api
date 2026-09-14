/* eslint-disable no-console */
/**
 * Applique les migrations SQL en attente (mêmes fichiers que le boot API).
 *
 * Usage :
 *   npm run migrate:run
 *   TEST_DATABASE_URL=... npm run migrate:run   # runner cible la bonne base
 */
import * as dotenv from 'dotenv';
import { MigrationRunner } from '../src/prisma/migration-runner';

dotenv.config({ path: '.env' });

async function main(): Promise<void> {
  const result = await MigrationRunner.run({
    migrationsDir: process.env.MIGRATIONS_DIR || undefined,
    log: (message) => console.log(message),
  });

  console.log(`Migrations directory : ${result.migrationsDir ?? '(introuvable)'}`);
  console.log(
    `Appliquées : ${result.applied.length} — déjà enregistrées : ${result.skipped.length}`,
  );
  if (result.applied.length > 0) {
    console.log('- ' + result.applied.join('\n- '));
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});