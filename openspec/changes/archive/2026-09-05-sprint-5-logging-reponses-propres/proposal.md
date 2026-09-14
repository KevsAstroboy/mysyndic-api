## Why

Les logs de l'API ne sont pas exploitables : format NestJS brut (brackets mono-ligne), aucune correlation entre requête et logs applicatifs, headers/payloads vides au lieu d'un traçage structuré, tokens et secrets affichables dans les logs d'erreur, `console.log` résiduels dans `main.ts`. Par ailleurs, les controllers exposent les lignes Prisma brutes avec des champs `null` (relations optionnelles, dates vides, champs d'audit `*_by`) — réponse JSON bruitée pour les clients.

## What Changes

- **Logging structuré JSON** : intégration `nestjs-pino` + `pino`. Logs applicatifs (Nest, services, guards, filters) en JSON par ligne, niveaux configurables via env `LOG_LEVEL`, `transport` `pino-pretty` en mode dev (`NODE_ENV !== 'production'`).
- **Correlation par requête** : `pino-http` génère un `req.id` (uuid en production, aléatoire) propagé dans chaque log de la requête et réponse (`request received` / `request completed`, durée ms). Réponse erreur inclut le même `req.id`.
- **Redaction des secrets** : option pino `redact` — `Authorization`, `password`, `password_hash`, `GMAIL_APP_PASSWORD`, `PAYSTACK_SECRET_KEY`, etc. remplacés par `[Redacted]` dans les logs.
- **Suppression des logs de requêtage bruit inutile** : seuls méthodes/status/durée/résumé loggués, pas de body complet en info (optionnel à `LOG_BODY=true`).
- **Remplacement `console.log`** par `Logger` (démarrage API) ; retrait de tout autre `console.*` résiduel.
- **Réponses sans `null`** : interceptor global `StripNullInterceptor` — supprime récursivement les clés de valeur `null`/`undefined` dans les objets JSON sérialisables, après `DateFormatInterceptor`. Respecte `StreamableFile`, buffers, stream/presigned non mutables, booléens `false` et `0` conservés. Compatible erreurs (le filtre continue de passer tel quel).

## Capabilities

### New Capabilities
- `logging`: logs applicatifs structurés JSON, correlation id par requête, niveaux configurables, redaction de données sensibles
- `api-response-clean`: réponses d'API débarrassées des champs `null`/`undefined`, sans altérer la sémantique des valeurs primitives

### Modified Capabilities
<!-- Aucun spec existant (openspec/specs/) ne change ses requirements. StripNullInterceptor et LoggerService sont des détails d'implémentation transverses, non du comportement métier. -->

## Impact

- **Dépendances** : ajout `nestjs-pino`, `pino` ; devDep `pino-pretty` (dev only). Aucune sur le schéma Prisma.
- **Code** : `main.ts` (app.useLogger(new LoggerFactory()), pino-http, enableCors inchangé), nouveau `src/common/interceptors/strip-null.interceptor.ts` branché dans `app.useGlobalInterceptors(..., new StripNullInterceptor())`, `env LOG_LEVEL` documenté, remplacement `console.log` démarrage par Logger.
- **Config** : clés env système : `LOG_LEVEL` (trace|debug|info|warn|error, défaut `info`), `LOG_BODY` (défaut `false`), `NODE_ENV` pour pino-pretty.
- **Tests** : suites e2e existantes doivent rester vertes (le strip ne doit pas casser les assertions — aucun test ne dépend d'une valeur `null` ; vérification). Nouvelle spec `test/logging.e2e-spec.ts` (correlation id dans réponse erreur + logs JSON) et `test/strip-null.e2e-spec.ts` (réponse sans null).