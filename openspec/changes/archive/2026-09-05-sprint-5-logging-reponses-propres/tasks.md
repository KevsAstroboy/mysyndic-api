## 1. Dépendances + socle logging

- [x] 1.1 Installer `nestjs-pino` + `pino` (deps) et `pino-pretty` (devDep)
- [x] 1.2 Créer `src/common/logger/logger.config.ts` : factory pino options (level `LOG_LEVEL`, redact secrets, serializers, `customProps` service)
- [x] 1.3 Brancher `LoggerModule.forRootAsync(logger.config)` dans `app.module.ts` (premier import)
- [x] 1.4 Remplacer les `console.log` du `main.ts` par `Logger.log` ; vérifier aucun `console.*` résiduel dans `src/`

## 2. Correlation id + erreurs

- [x] 2.1 Configurer `pino-http` (`genReqId`, `customProps`, `autoLogging`, ignore route `/api/docs`) ; header réponse `X-Request-Id` branché (middleware Nest `RequestIdMiddleware` + hook onResponse)
- [x] 2.2 Ajouter `requestId` au body d'erreur du `GlobalExceptionFilter` (lecture `req.id`)
- [x] 2.3 Vérifier redaction effective : headers auth + bodies `password` invisibles (testé : aucune occurrence)

## 3. Nettoyage des réponses null

- [x] 3.1 Créer `src/common/interceptors/strip-null.interceptor.ts` : `map` RxJS, `stripNullDeep` récursif (objets/arrays/primitives), protections `StreamableFile` + réponse brute (réutiliser `isRawResponse`)
- [x] 3.2 Enregistrer `new StripNullInterceptor()` dans `app.useGlobalInterceptors` (après `DateFormatInterceptor`) dans `main.ts`
- [x] 3.3 Vérifier npm build + pointe : création annonce sans categorie → JSON sans `null` (testé : aucune clé nulle, `est_epinglee:false` conservé)

## 4. Tests e2e

- [x] 4.1 `test/logging.e2e-spec.ts` : header `X-Request-Id` présent + `requestId` dans body 404 identique + body 500 conserve format (statusCode/message/path)
- [x] 4.2 `test/strip-null.e2e-spec.ts` : annonce créée sans categorie → `GET /api/annonces` → aucune occurrence `null` dans `JSON.stringify` ; `est_epinglee: false` conservé ; date `created_at` présente
- [x] 4.3 Run suite complète e2e (`LOG_LEVEL=warn`) : 13 suites vertes non-régression + jwt build OK