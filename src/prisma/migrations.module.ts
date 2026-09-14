import { Injectable, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { MigrationRunner } from './migration-runner';

@Injectable()
export class MigrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MigrationService.name);

  async onApplicationBootstrap(): Promise<void> {
    const enabled = process.env.RUN_MIGRATIONS_ON_BOOT !== 'false';
    if (!enabled) {
      this.logger.log('Migrations au boot désactivées (RUN_MIGRATIONS_ON_BOOT=false)');
      return;
    }

    try {
      const result = await MigrationRunner.run({
        log: (message) => this.logger.log(message),
      });
      if (result.applied.length > 0) {
        this.logger.log(`Migrations appliquées : ${result.applied.join(', ')}`);
      }
    } catch (err) {
      this.logger.error(
        `Échec des migrations au boot : ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }
  }
}

/**
 * Exécute les migrations SQL au démarrage. Positionné APRÈS PrismaModule dans
 * AppModule : le client Prisma est prêt quand onApplicationBootstrap tourne.
 *
 * Désactivable via RUN_MIGRATIONS_ON_BOOT=false (prod/CI qui veulent un
 * contrôle manuel avec `npm run migrate:run`).
 */
@Module({
  providers: [MigrationService],
})
export class MigrationsModule {}