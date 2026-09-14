## Context

API NestJS 10 (`sprint-1`→`sprint-4`, 10 modules métier) ; `GlobalExceptionFilter` gère erreurs + exceptions Prisma (labels FK FR), `DateFormatInterceptor` formate les dates. Logging = système par défaut Nest (sortie monolithique en brackets) ; pas de correlation id, pas de redaction, `console.log` dans `main.ts` pour l'annonce du boot. Les services retournent les enregistrements Prisma bruts (avec includes) → les réponses JSON contiennent des champs à `null` (relations optionnelles non peuplées, `*_by` d'audit, `deleted_at` etc.).

Objectif du change : (1) logs structurés, corrélés, sûrs, (2) réponses d'API compactes sans clés nulles. Pas d'audit dashboard (hors scope, décision utilisateur).

## Goals / Non-Goals

**Goals:**
- Logs JSON 1-ligne par événement, corrélés par `req.id` (requête → réponse → erreur).
- Niveaux config (LOG_LEVEL), pretty en dev, JSON en prod.
- Redaction automatique des secrets/tokens dans tout log.
- Réponses JSON sans clés `null`/`undefined`, sans casser les valeurs primitives (`false`, `0`, `''`).
- Non-régression : les 60 tests e2e restent verts.

**Non-Goals:**
- Pas d'export/aggregation de logging externe (ELK/Datadog) — sortie stdout suffit.
- Pas de suppression des champs `""` ni des `[]` vides (sémantique), seul `null`/`undefined`.
- Pas de changement des contracts body (les erreurs gardent leur forme JSON).
- Pas de mutation du schéma de données / architecture.

## Decisions

1. **`nestjs-pino` + `pino`** : `LoggerModule.forRoot(...)` dans `AppModule` (avant les imports), garantir le transport. `pino-pretty` ajouté en dev only via choix implicite `NODE_ENV !== 'production'`. *Alternative rejetée* : `winston` (plus lourd), logger custom Nest (réinvente JSON/formatters/redaction). `nest-electron` non retenu — nestjs-pino couvre Nest + HTTP.

2. **Transport/config centralisée dans `src/common/logger/logger.config.ts`** facteur commune `buildPinoHttpOptions()` : `level` depuis `LOG_LEVEL`, `redact` table (cf. ci-dessous), `serializers` custom minimal, `customProps` pour ajouter service/version, `autoLogging` pour logs requête/réponse. En dev : `transport: { target: 'pino-pretty', options: { colorize, singleLine } }`.

3. **Correlation id** : `pino-http` génère `req.id` (par défaut `genReqId` aléatoire). Il est ajouté au header de réponse `X-Request-Id` via le middleware http ; le body d'erreur du `GlobalExceptionFilter` inclut `requestId` (lu depuis `req.id`). *Alternative* : header client echo — abandonné, génération serveur suffit.

4. **Redaction** (`redact` array) : chemins pino exacts :
   - `req.headers.authorization`, `req.headers.cookie`
   - `*.password`, `*.password_hash`, `*.old_password`, `*.new_password`
   - `*.PAYSTACK_SECRET_KEY`, `*.GMAIL_APP_PASSWORD`, `*.secret`, `*.token`, `*.access_token`, `*.refresh_token`, `*.data.token`
   - `*.montant`/`*.montant_attendu`? Non — montants non sensibles. **Ne pas redacter** données financières (non-secret).

5. **Logging applicatif** : `LoggerModule` remplace le logger Nest global (`app.useLogger(app.get(Logger))` — non, nestjs-pino branche automatiquement `Logger` de Nest sur pino). Les `Logger` existants des services/filters restent non changés — ils émettent désormais vers pino.

6. **Console handling** : `main.ts` remplace les 2 `console.log` par `Logger.log()` ; les éventuels `console.error/warn` dans le code sont remplacés par `Logger`.

7. **`StripNullInterceptor`** (nouveau, dans `src/common/interceptors/strip-null.interceptor.ts`) : via RxJS `map`, après `DateFormatInterceptor` dans `app.useGlobalInterceptors`. Fonction pure `stripNullDeep(value)` :
   - primitives : retournées telles quelles (y compris `false`, `0`, `''`, `NaN`)
   - `null`/`undefined` : capturés par le parent (clé supprimée) ; racine `null` → `{}` (si objet) ou `null` (si valeur racine d'unarray ne convient pas — on laisse).
   - Date : passée (déjà formatée par DateFormat avant nous — on ne touche pas aux string).
   - Arrays : map récursif, éléments `null` **supprimés** (nettoie les listes) — mais risque : un tableau de placeholders positionnels? Prisma ne renvoie pas de null comme significatif dans arrays de notre API. Décision : supprime `null` des array aussi.
   - Objets : `Date` instanceof → passer ; `Buffer` → passer ; sinon réduire aux clés dont valeur ≠ null/undefined.
   - Protection : `StreamableFile` (retour téléchargement PDF) → passer ; objets avec `pipe`/`setHeader` (raw express) → passer (comme DateFormatInterceptor.isRawResponse).
   - **Détecter `StreamableFile`** par `instanceof` + duck (`.getStream()`).
   - `data` de type brut (BLOB) : éviter mutation, cloner léger dans le map sérialisable.

8. **Compatibilité erreurs** : `GlobalExceptionFilter` renvoie corps JSON direct (`response.json`) — il n'est **pas** modifié par strip. Les erreurs conservent `statusCode`, `message`, `error`, `detail`, `timestamp`, `path` , on ajoute `requestId`. Aucun champ null retiré dans les erreurs (ils n'en ont pas).

9. **Tests** : nouvelle spec `test/logging.e2e-spec.ts` vérifie (a) header `X-Request-Id` présent sur réponse, (b) le `requestId` apparaît dans body d'erreur 404, (c) un route erreur 500 garde le format existant. Spec `test/strip-null.e2e-spec.ts` : créer entité (annonce) avec champs optionnels vides → GET retourne 0 clé `null` (vérif par `JSON.stringify(body).includes('null')`).

## Risks / Trade-offs

- [pino-http log chaque requête → volume] → `autoLogging.ignore` pour `/api/docs*, /api/auth/login` ? Non, garder login pour debog — `LOG_LEVEL=warn` atténue. Pretty en dev seule.
- [StripNull supprime `null` dans arrays] → risque sémantique si consumer dépend index ; nos endpoints n'exposent pas de null significatif ; testes le couvrent.
- [nestjs-pino + socket.io] → `pino-http` ne loggue que HTTP, pas socket ; acceptable (scope logging requestile). Gateway garde `Logger` (pino).
- [Redaction cas chemin pino partial] → redact par patterns `['req.headers.authorization','*.password','*.token','*.secret','*.access_token']` couvre nested via wildcard.
- [e2e dépendent de `null`?] → audité : aucun test n'assert une valeur null ; strip safe. Vérif run suite complète avant wrap.
- [pretty en test e2e pollue sortie] → `NODE_ENV=test` active JSON simple (pas pretty) via config.