# Graph Report - mysyndic-api  (2026-09-11)

## Corpus Check
- 227 files · ~214,790 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1741 nodes · 3919 edges · 144 communities (83 shown, 61 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 87 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- AuthenticatedRequest
- PaiementController
- conflit.controller.ts
- AlerteController
- MessageController
- DocumentController
- UserController
- PrismaService
- CiteController
- authenticated-request.interface.ts
- Paiement Webhook Spec
- Auth Capability
- NotifService
- auth.controller.ts
- .createPaystackSubaccount
- .update
- RequireFeature
- CriteriaService
- main.ts
- CriteriaBuilder
- mail-templates.ts
- AnnonceController
- AuthController
- feed.service.ts
- .paystack
- must-change-password.guard.ts
- generate-module.ts
- AuthService
- Sprint 4 - Design
- NotificationController
- alerte-securite.controller.ts
- compilerOptions
- PaiementManuelDto
- scripts
- devDependencies
- migration-runner.ts
- IsFlexibleUuid
- audit-log.interceptor.ts
- MySyndic Postman API Collection
- ChatGateway
- Sprint 5 - Design
- PaystackClientService
- .summary
- auth.service.ts
- RegisterDto
- opsx-apply Command
- MySyndic Design Tokens
- generate-postman.ts
- MySyndic API Service
- dependencies
- Incident Spec
- paiement.e2e-spec.ts
- MessageService
- exclude
- document.service.ts
- Session Cite Security Scoping
- PaiementService
- paiement.service.ts
- .constructor
- nest-cli.json
- package.json
- AuthResponseDto
- villa.controller.ts
- RBAC Profile Groups
- CreateSubaccountDto
- Sprint 3 - Incident Spec (delta)
- @prisma/client
- CommonModule
- CiteFilterInterceptor
- 2026-09-05-nestjs-sprint-1/tasks.md
- date-format.util.ts
- RedisModule
- sockets.module.ts
- FilesPreviewController
- Paiement Webhook Capability
- logger.config.ts
- AlerteSecuriteModule
- app.module.ts
- notification.module.ts
- StorageService
- PrismaModule
- message.service.ts
- class-transformer
- class-validator
- zz-init-test-db.sh
- ioredis
- mongoose
- .preview
- @nestjs/config
- @nestjs/core
- @nestjs/jwt
- @nestjs/passport
- nestjs-pino
- @nestjs/platform-express
- @nestjs/platform-socket.io
- DocumentService
- @nestjs/swagger
- @nestjs/testing
- @nestjs/websockets
- passport
- 2026-09-05-sprint-2-paiement/tasks.md
- pdfkit
- pg
- pino
- reflect-metadata
- @resvg/resvg-js
- rxjs
- socket.io
- pino-pretty
- prettier
- prisma
- socket.io-client
- supertest
- ts-node
- tsconfig-paths
- @types/bcrypt
- @types/bcryptjs
- @types/jest
- @types/multer
- @types/node
- @types/passport-jwt
- @types/qrcode
- @types/supertest
- typescript
- Docker Compose Dev Stack
- MinIO Storage Abstraction
- recu_paiement Source of Truth
- villa-occupancy.guard.ts
- .upload
- UpdateProfilFeaturesDto
- 2026-09-05-paystack-subaccounts-per-cite/tasks.md
- MustChangePasswordGuard
- feed.module.ts
- jest
- minio
- nodemailer
- qrcode
- @socket.io/redis-adapter
- cite-id.decorator.ts
- current-user.decorator.ts
- .constructor
- ConfigurationModule
- MigrationsModule

## God Nodes (most connected - your core abstractions)
1. `AuthenticatedRequest` - 134 edges
2. `RequireFeature()` - 98 edges
3. `PrismaService` - 96 edges
4. `VillaService` - 43 edges
5. `AuthService` - 34 edges
6. `StorageService` - 29 edges
7. `PaiementService` - 26 edges
8. `VillaController` - 26 edges
9. `CriteriaService` - 23 edges
10. `IsFlexibleUuid()` - 23 edges

## Surprising Connections (you probably didn't know these)
- `Versioned SQL Migrations` --semantically_similar_to--> `Prisma Sync Service`  [INFERRED] [semantically similar]
  migrations/README.md → docker-compose.yml
- `MySyndic Design Tokens` --conceptually_related_to--> `spec-driven OpenSpec Schema`  [AMBIGUOUS]
  design/mysyndic-design.html → openspec/config.yaml
- `MySyndic API Service` --conceptually_related_to--> `MySyndic Postman API Collection`  [INFERRED]
  docker-compose.yml → MySyndic.postman_collection.json.txt
- `Paystack Payment Integration` --conceptually_related_to--> `Paiements API`  [INFERRED]
  docs/release-notes.md → MySyndic.postman_collection.json.txt
- `Session Cite Security Scoping` --conceptually_related_to--> `RBAC Profile Groups`  [INFERRED]
  docs/dsl-getbycriteria.md → MySyndic.postman_collection.json.txt

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **OpenSpec Change Workflow** — _opencode_commands_opsx_apply_command, _opencode_commands_opsx_archive_command, _opencode_commands_opsx_explore_command, _opencode_commands_opsx_propose_command, _opencode_commands_opsx_sync_command, _opencode_skills_openspec_apply_change_skill_skill, _opencode_skills_openspec_archive_change_skill_skill, _opencode_skills_openspec_explore_skill_skill, _opencode_skills_openspec_propose_skill_skill, _opencode_skills_openspec_sync_specs_skill_skill, openspec_config_spec_driven_schema [INFERRED 0.85]
- **MySyndic API Domain Modules** — mysyndic_postman_collection_json_auth_api, mysyndic_postman_collection_json_users_api, mysyndic_postman_collection_json_paiements_api, mysyndic_postman_collection_json_alertes_api, mysyndic_postman_collection_json_incidents_api, mysyndic_postman_collection_json_annonces_api, mysyndic_postman_collection_json_conflits_api, mysyndic_postman_collection_json_villas_api, mysyndic_postman_collection_json_cites_api, mysyndic_postman_collection_json_messages_api, mysyndic_postman_collection_json_documents_api, mysyndic_postman_collection_json_notifications_api [INFERRED 0.85]
- **MySyndic Design System** — design_mysyndic_design_design_tokens, design_mysyndic_design_palette, design_mysyndic_design_typography, design_mysyndic_design_component_system, design_mysyndic_design_3_design_system_recap, design_mysyndic_design_3_tailwind_vars [INFERRED 0.85]
- **Paystack Subaccount Checkout Model** — openspec_changes_archive_2026_09_05_paystack_subaccounts_per_cite_design_subaccount_per_cite, openspec_changes_archive_2026_09_05_paystack_subaccounts_per_cite_design_simple_mode, openspec_changes_archive_2026_09_05_paystack_subaccounts_per_cite_design_split_mode, openspec_changes_archive_2026_09_05_paystack_subaccounts_per_cite_design_montant_match, openspec_changes_archive_2026_09_05_paystack_subaccounts_per_cite_proposal_master_account [EXTRACTED 1.00]
- **Sprint 3 Security and Communication Modules** — openspec_changes_archive_2026_09_05_sprint_3_securite_communication_proposal_alerte, openspec_changes_archive_2026_09_05_sprint_3_securite_communication_proposal_incident, openspec_changes_archive_2026_09_05_sprint_3_securite_communication_proposal_conflit, openspec_changes_archive_2026_09_05_sprint_3_securite_communication_proposal_annonce, openspec_changes_archive_2026_09_05_sprint_3_securite_communication_design_generator_adapt [EXTRACTED 1.00]
- **Multi-Tenant cite_id Scoping Socle** — openspec_changes_archive_2026_09_05_nestjs_sprint_1_design_cite_scoping, openspec_changes_archive_2026_09_05_nestjs_sprint_1_specs_auth_spec_capability, openspec_changes_archive_2026_09_05_nestjs_sprint_1_specs_villa_management_spec_capability, openspec_changes_archive_2026_09_05_nestjs_sprint_1_specs_user_management_spec_capability, openspec_changes_archive_2026_09_05_nestjs_sprint_1_specs_configuration_management_spec_capability [INFERRED 0.85]
- **Sprint 4 real-time messaging pipeline** — openspec_changes_archive_2026_09_05_sprint_4_messagerie_documents_notifications_specs_messagerie_spec, openspec_changes_archive_2026_09_05_sprint_4_messagerie_documents_notifications_design_chat_gateway, openspec_changes_archive_2026_09_05_sprint_4_messagerie_documents_notifications_design_message_content_service, openspec_changes_archive_2026_09_05_sprint_4_messagerie_documents_notifications_design_redis_read_state [INFERRED 0.85]
- **Sprint 5 structured logging stack** — openspec_changes_archive_2026_09_05_sprint_5_logging_reponses_propres_specs_logging_spec, openspec_changes_archive_2026_09_05_sprint_5_logging_reponses_propres_specs_logging_spec_structured_json_logging, openspec_changes_archive_2026_09_05_sprint_5_logging_reponses_propres_specs_logging_spec_correlation_id, openspec_changes_archive_2026_09_05_sprint_5_logging_reponses_propres_specs_logging_spec_redaction [INFERRED 0.85]
- **Sprint 5 clean API response pipeline** — openspec_changes_archive_2026_09_05_sprint_5_logging_reponses_propres_specs_api_response_clean_spec, openspec_changes_archive_2026_09_05_sprint_5_logging_reponses_propres_specs_api_response_clean_spec_strip_null_interceptor, openspec_changes_archive_2026_09_05_sprint_5_logging_reponses_propres_design_date_format_interceptor, openspec_specs_api_response_clean_spec [INFERRED 0.75]
- **Paystack payment lifecycle (init to receipt)** — openspec_specs_paiement_webhook_spec_initiation, openspec_specs_paiement_webhook_spec_webhook_signature, openspec_specs_paiement_webhook_spec_idempotence, openspec_specs_paiement_webhook_spec_traitement_async, openspec_specs_paystack_subaccounts_spec_subaccount_cite, openspec_specs_paystack_subaccounts_spec_montant_match, openspec_specs_paiement_webhook_spec_recu_pdf [INFERRED 0.85]
- **Unread/read-state tracking across messages and notifications** — openspec_specs_messagerie_spec_marquage_lu, openspec_specs_messagerie_spec_historique, openspec_specs_notification_spec_badge, openspec_specs_notification_spec_marquage_lu, openspec_specs_notification_spec_liste [INFERRED 0.75]
- **Realtime socket delivery pattern** — openspec_specs_messagerie_spec_message_prive, openspec_specs_messagerie_spec_message_groupe, openspec_specs_notification_spec_emission, openspec_specs_notification_spec_diffusion [INFERRED 0.75]

## Communities (144 total, 61 thin omitted)

### Community 0 - "AuthenticatedRequest"
Cohesion: 0.10
Nodes (20): AuthenticatedRequest, ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags, Body, Controller (+12 more)

### Community 1 - "PaiementController"
Cohesion: 0.14
Nodes (17): PaiementController, ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags, Body, Controller (+9 more)

### Community 2 - "conflit.controller.ts"
Cohesion: 0.08
Nodes (32): ConflitController, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, Body, Controller, Get (+24 more)

### Community 3 - "AlerteController"
Cohesion: 0.11
Nodes (20): AlerteController, ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags, Body, Controller (+12 more)

### Community 4 - "MessageController"
Cohesion: 0.19
Nodes (14): MessageController, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, Body, Controller, Delete (+6 more)

### Community 5 - "DocumentController"
Cohesion: 0.22
Nodes (11): DocumentController, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, Controller, Delete, Get (+3 more)

### Community 6 - "UserController"
Cohesion: 0.07
Nodes (45): JwtUser, AssignProfilItemDto, AssignProfilsDto, CreateAdminDto, CreateStaffDto, ApiProperty, ApiPropertyOptional, ArrayMaxSize (+37 more)

### Community 7 - "PrismaService"
Cohesion: 0.09
Nodes (9): PrismaService, Injectable, createStaffWithTempPassword(), login(), PNG_1PX, setupTestApp(), TEST_CITE_ID, TEST_USERS (+1 more)

### Community 8 - "CiteController"
Cohesion: 0.10
Nodes (25): CiteController, ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags, Body, Controller (+17 more)

### Community 9 - "authenticated-request.interface.ts"
Cohesion: 0.29
Nodes (7): FEATURE_KEY, JwtAuthGuard, Injectable, RbacGuard, Injectable, FEED_TMP_DIR, feedMulterOptions

### Community 10 - "Paiement Webhook Spec"
Cohesion: 0.07
Nodes (40): Logging Spec, Correlation id par requete, Journalisation des requetes HTTP, Logging structure JSON (pino), Niveaux configurables LOG_LEVEL, Redaction des donnees sensibles, Messagerie Spec, Historique des conversations (+32 more)

### Community 11 - "Auth Capability"
Cohesion: 0.06
Nodes (39): NestJS Sprint 1 Change, Audit Log Interceptor, cite_id Scoping Decorator and Interceptor, JWT Payload MySyndic, generate-module.ts Generator, Prisma ORM (db pull), Redis Sessions and RBAC Cache, Multi-Tenant Security Socle (+31 more)

### Community 12 - "NotifService"
Cohesion: 0.12
Nodes (8): RequestIdMiddleware, Injectable, NotifService, SendNotifParams, SendToCiteOptions, Injectable, Injectable, UploadService

### Community 13 - "auth.controller.ts"
Cohesion: 0.12
Nodes (16): Length, ActivateAccountDto, ResendActivationOtpDto, ApiProperty, IsEmail, IsString, ChangePasswordDto, ApiProperty (+8 more)

### Community 14 - ".createPaystackSubaccount"
Cohesion: 0.19
Nodes (13): ConfigurationController, ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags, Body, Controller (+5 more)

### Community 15 - ".update"
Cohesion: 0.10
Nodes (18): Put, ProfilFeatureController, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, Body, Controller (+10 more)

### Community 16 - "RequireFeature"
Cohesion: 0.07
Nodes (41): RequireFeature(), CommentaireDto, ApiProperty, IsString, MaxLength, CreateIncidentDto, ApiProperty, ApiPropertyOptional (+33 more)

### Community 17 - "CriteriaService"
Cohesion: 0.22
Nodes (3): CriteriaService, PrismaDelegate, Injectable

### Community 18 - "main.ts"
Cohesion: 0.19
Nodes (10): Catch, extractFkColumn(), findLabelBySuffix(), FK_LABELS, GlobalExceptionFilter, handlePrismaError(), isRawResponse(), stripNullDeep() (+2 more)

### Community 19 - "CriteriaBuilder"
Cohesion: 0.13
Nodes (13): BuiltQuery, CriteriaBuilder, extractRelations(), extractScalars(), isValidColumn(), isValidRelation(), CriteriaParser, OPERATOR_MAP (+5 more)

### Community 20 - "mail-templates.ts"
Cohesion: 0.12
Nodes (18): MailModule, Global, Module, MailService, SMTP_IPS, Injectable, escapeAttr(), escapeHtml() (+10 more)

### Community 21 - "AnnonceController"
Cohesion: 0.07
Nodes (31): AnnonceController, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, Body, Controller, Delete (+23 more)

### Community 22 - "AuthController"
Cohesion: 0.30
Nodes (14): Public(), AuthController, ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags, Body (+6 more)

### Community 23 - "feed.service.ts"
Cohesion: 0.06
Nodes (43): isUploadEmpty(), CommentaireDto, ApiProperty, IsString, MaxLength, CreatePostDto, ApiPropertyOptional, IsOptional (+35 more)

### Community 24 - ".paystack"
Cohesion: 0.11
Nodes (16): Headers, verifyHmacSignature(), ApiOperation, ApiTags, Controller, HttpCode, Post, Req (+8 more)

### Community 25 - "must-change-password.guard.ts"
Cohesion: 0.18
Nodes (7): IS_PUBLIC_KEY, PublicOnboardingController, ApiOperation, ApiTags, Controller, Get, Param

### Community 26 - "generate-module.ts"
Cohesion: 0.16
Nodes (21): exampleFor(), EXCLUDE_MODELS, extractMeta(), generateModule(), humanLabel(), listModels(), main(), ModelMeta (+13 more)

### Community 27 - "AuthService"
Cohesion: 0.16
Nodes (5): AuthService, Injectable, SessionCache, SessionOptions, SessionProfil

### Community 28 - "Sprint 4 - Design"
Cohesion: 0.15
Nodes (21): Sprint 4 - OpenSpec Metadata, Sprint 4 - Design, ChatGateway (socket.io global), Systematic Cite Scoping (cite_id), MessageContentService (MongoDB driver), MinIO StorageService, NotifService.sendToCite (targeted diffusion), notification:new Socket Event (+13 more)

### Community 29 - "NotificationController"
Cohesion: 0.23
Nodes (12): NotificationController, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, Controller, Get, Param (+4 more)

### Community 30 - "alerte-securite.controller.ts"
Cohesion: 0.15
Nodes (15): IMAGE_MIME_TO_EXT, CreateAlerteDto, ApiPropertyOptional, IsOptional, IsString, MaxLength, Transform, ResoudreAlerteDto (+7 more)

### Community 31 - "compilerOptions"
Cohesion: 0.10
Nodes (19): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, experimentalDecorators, forceConsistentCasingInFileNames, incremental (+11 more)

### Community 32 - "PaiementManuelDto"
Cohesion: 0.14
Nodes (18): CanalCode, CANAUX_MANUELS, InitPaystackDto, PaiementManuelDto, PaiementRechercheDto, ApiProperty, ApiPropertyOptional, ArrayMaxSize (+10 more)

### Community 33 - "scripts"
Cohesion: 0.11
Nodes (18): scripts, build, db:setup, db:sync, format, lint, migrate:run, postman:generate (+10 more)

### Community 34 - "devDependencies"
Cohesion: 0.12
Nodes (17): @nestjs/cli, @nestjs/schematics, devDependencies, @nestjs/cli, @nestjs/schematics, source-map-support, ts-jest, @types/express (+9 more)

### Community 35 - "migration-runner.ts"
Cohesion: 0.20
Nodes (9): main(), listMigrationFiles(), MigrationOptions, MigrationResult, MigrationRunner, resolveMigrationsDir(), sleep(), MigrationService (+1 more)

### Community 36 - "IsFlexibleUuid"
Cohesion: 0.24
Nodes (8): RFC-412, IsFlexibleUuid(), SwitchContextDto, ApiProperty, SendPrivateMessageDto, ApiProperty, IsNotEmpty, IsString

### Community 37 - "audit-log.interceptor.ts"
Cohesion: 0.33
Nodes (3): ActionName, AuditLogInterceptor, Injectable

### Community 38 - "MySyndic Postman API Collection"
Cohesion: 0.22
Nodes (14): Security Chief Alert Flow, Incidents, Annonces & Conflits Screens, Annonces Screens (Habitant & Syndic), Conflits Moderation Screen, get-by-criteria DSL, DSL Filter Operators, Paginated Response Envelope, Alertes API (+6 more)

### Community 39 - "ChatGateway"
Cohesion: 0.20
Nodes (5): MessageBody, ChatGateway, SubscribeMessage, WebSocketGateway, WebSocketServer

### Community 40 - "Sprint 5 - Design"
Cohesion: 0.20
Nodes (14): Sprint 5 - OpenSpec Metadata, Sprint 5 - Design, DateFormatInterceptor, GlobalExceptionFilter, nestjs-pino + pino, Sprint 5 - Proposal, Sprint 5 - API Response Clean Spec (delta), StripNullInterceptor (+6 more)

### Community 41 - "PaystackClientService"
Cohesion: 0.16
Nodes (4): ConfigurationService, Injectable, PaystackClientService, Injectable

### Community 42 - ".summary"
Cohesion: 0.10
Nodes (14): DashboardController, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, Controller, Get, Query (+6 more)

### Community 43 - "auth.service.ts"
Cohesion: 0.18
Nodes (7): JwtPayload, generateOtpCode(), ForgotPasswordDto, ApiProperty, IsEmail, JwtStrategy, Injectable

### Community 44 - "RegisterDto"
Cohesion: 0.25
Nodes (7): RegisterDto, ApiProperty, IsEmail, IsOptional, IsString, Matches, MinLength

### Community 45 - "opsx-apply Command"
Cohesion: 0.24
Nodes (11): opsx-apply Command, opsx-archive Command, opsx-explore Command, opsx-propose Command, opsx-sync Command, openspec-apply-change Skill, openspec-archive-change Skill, openspec-explore Skill (+3 more)

### Community 46 - "MySyndic Design Tokens"
Cohesion: 0.18
Nodes (11): Design System Recap (Tokens, Motion), Payment Management Desktop Screen, Tailwind CSS Variables, Design Component System, MySyndic Design Tokens, Habitant Mobile Home Screen, Tropical Teal Palette, Syndic Desktop Dashboard (+3 more)

### Community 47 - "generate-postman.ts"
Cohesion: 0.38
Nodes (9): bodyFor(), buildRequest(), FILE_FIELDS, itemFor(), main(), PROFIL_LABELS, resolveRef(), sampleObject() (+1 more)

### Community 48 - "MySyndic API Service"
Cohesion: 0.21
Nodes (14): Private & Cite Messaging Screens, Habitant Profile & Documents Screen, MySyndic API Service, MinIO Service, MongoDB Service, API Environment Override, PostgreSQL Service, Prisma Sync Service (+6 more)

### Community 49 - "dependencies"
Cohesion: 0.22
Nodes (9): bcryptjs, exceljs, @nestjs/common, dependencies, bcryptjs, exceljs, @nestjs/common, passport-jwt (+1 more)

### Community 50 - "Incident Spec"
Cohesion: 0.22
Nodes (9): Incident Spec, Commentaires arborescents 2 niveaux, Feature INCIDENT_COMMENT, Feature INCIDENT_CREATE, Feature INCIDENT_LIKE, Feature INCIDENT_READ, Liste et detail d'un incident, Likes sur un incident (toggle) (+1 more)

### Community 51 - "paiement.e2e-spec.ts"
Cohesion: 0.28
Nodes (6): test, AppModule, Module, setupPaiementApp(), cleanTestDb(), seedTestData()

### Community 52 - "MessageService"
Cohesion: 0.13
Nodes (5): MessageContentService, Injectable, MessageService, Inject, Injectable

### Community 53 - "exclude"
Cohesion: 0.25
Nodes (7): dist, node_modules, **/*spec.ts, test, ./tsconfig.json, exclude, extends

### Community 54 - "document.service.ts"
Cohesion: 0.20
Nodes (8): DocumentModule, Module, MIME_TO_EXT, ApiProperty, IsNotEmpty, IsString, MaxLength, UploadDocumentDto

### Community 55 - "Session Cite Security Scoping"
Cohesion: 0.33
Nodes (7): Super Admin Multi-Cite View, Session Cite Security Scoping, Paystack Payment Integration, Paystack Webhook (HMAC-SHA512), Sprint 2 Release (Payment + Webhook), Paystack Subaccount per Cite, Cites API

### Community 57 - "paiement.service.ts"
Cohesion: 0.17
Nodes (10): COLORS, ExcelExportService, PaiementExportRow, Injectable, PaiementModule, Module, listMonths(), normalizeRawRows() (+2 more)

### Community 58 - ".constructor"
Cohesion: 0.21
Nodes (7): FONT_FILE_BOLD, FONT_FILE_REGULAR, THEME, Inject, ReceiptData, ReceiptImageService, Injectable

### Community 59 - "nest-cli.json"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 60 - "package.json"
Cohesion: 0.33
Nodes (5): description, license, name, private, version

### Community 61 - "AuthResponseDto"
Cohesion: 0.21
Nodes (9): AuthProfilDto, AuthResponseDto, AuthUserDto, ApiProperty, ApiPropertyOptional, LoginDto, ApiProperty, IsString (+1 more)

### Community 62 - "villa.controller.ts"
Cohesion: 0.36
Nodes (9): AssignUserDto, CandidatureVillaDto, CreateVillaDto, ApiProperty, ApiPropertyOptional, IsOptional, IsString, MinLength (+1 more)

### Community 63 - "RBAC Profile Groups"
Cohesion: 0.50
Nodes (5): Admin Console Account Management, Login & Onboarding Screens, Auth & Public API, RBAC Profile Groups, Users API

### Community 64 - "CreateSubaccountDto"
Cohesion: 0.23
Nodes (12): ConfigurationResponseDto, CreateSubaccountDto, ApiProperty, ApiPropertyOptional, IsEmail, IsIn, IsInt, IsOptional (+4 more)

### Community 65 - "Sprint 3 - Incident Spec (delta)"
Cohesion: 0.40
Nodes (5): Sprint 3 - Incident Spec (delta), Incident Threaded Comments (max depth 2), Incident Likes (toggle, composite PK), Sprint 3 - Tasks, Conflit Spec

### Community 66 - "@prisma/client"
Cohesion: 0.50
Nodes (3): @prisma/client, @prisma/client, main()

### Community 67 - "CommonModule"
Cohesion: 0.50
Nodes (3): CommonModule, Global, Module

### Community 69 - "2026-09-05-nestjs-sprint-1/tasks.md"
Cohesion: 0.17
Nodes (11): 10. Générateur de modules (adaptation aff-api), 11. Tests & Validation, 1. Infra & Scaffold, 2. Base de données (Prisma), 3. Socle commun (réutilisé aff-api), 4. Guards, decorators, interceptors MySyndic, 5. Module Auth, 6. Module Cité (+3 more)

### Community 70 - "date-format.util.ts"
Cohesion: 0.27
Nodes (9): DateFormatInterceptor, isRawResponse(), Injectable, DATE_ONLY_FIELDS, detectFieldFormat(), formatDate(), TIME_ONLY_FIELDS, TOKEN_MAP (+1 more)

### Community 71 - "RedisModule"
Cohesion: 0.50
Nodes (3): RedisModule, Global, Module

### Community 72 - "sockets.module.ts"
Cohesion: 0.50
Nodes (3): SocketsModule, Global, Module

### Community 73 - "FilesPreviewController"
Cohesion: 0.20
Nodes (8): FilesPreviewController, ApiBearerAuth, ApiTags, Controller, UseGuards, StorageModule, Global, Module

### Community 74 - "Paiement Webhook Capability"
Cohesion: 0.67
Nodes (3): Async Webhook Processing, Manual Payment Entry, Paiement Webhook Capability

### Community 77 - "app.module.ts"
Cohesion: 0.20
Nodes (11): AuthModule, Global, Module, CiteModule, Module, ConflitModule, Module, IncidentModule (+3 more)

### Community 80 - "PrismaModule"
Cohesion: 0.67
Nodes (3): PrismaModule, Global, Module

### Community 81 - "message.service.ts"
Cohesion: 0.22
Nodes (7): MessageContent, SendGroupeMessageDto, ApiProperty, IsNotEmpty, IsString, MessageModule, Module

### Community 87 - ".preview"
Cohesion: 0.25
Nodes (6): ALLOWED_PREFIXES, ApiOperation, Get, Query, Request, Res

### Community 100 - "2026-09-05-sprint-2-paiement/tasks.md"
Cohesion: 0.25
Nodes (7): 1. Dépendances & services partagés, 2. Module Paiement, 3. Module Webhook, 4. Notifications (inline minimal), 5. Enregistrement modules & config, 6. Tests e2e, 7. Documentation & OpenSpec

### Community 127 - "villa-occupancy.guard.ts"
Cohesion: 0.29
Nodes (4): Injectable, VILLA_ABSENTE, VILLA_EN_ATTENTE, VillaOccupancyGuard

### Community 128 - ".upload"
Cohesion: 0.33
Nodes (5): ApiConsumes, Body, Post, UploadedFile, UseInterceptors

### Community 129 - "UpdateProfilFeaturesDto"
Cohesion: 0.33
Nodes (5): ApiProperty, ArrayMinSize, IsArray, IsString, UpdateProfilFeaturesDto

### Community 130 - "2026-09-05-paystack-subaccounts-per-cite/tasks.md"
Cohesion: 0.40
Nodes (4): 1. app_config — clés Paystack globales, 2. configuration — subaccount par cité, 3. webhook — generated column montant_match, 4. Vérifications & cohérence globale

## Ambiguous Edges - Review These
- `MySyndic Design Tokens` → `spec-driven OpenSpec Schema`  [AMBIGUOUS]
  design/mysyndic-design.html · relation: conceptually_related_to

## Knowledge Gaps
- **236 isolated node(s):** `zz-init-test-db.sh script`, `$schema`, `collection`, `sourceRoot`, `deleteOutDir` (+231 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **61 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `MySyndic Design Tokens` and `spec-driven OpenSpec Schema`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `AuthenticatedRequest` connect `AuthenticatedRequest` to `.upload`, `PaiementController`, `conflit.controller.ts`, `AlerteController`, `MessageController`, `DocumentController`, `UserController`, `authenticated-request.interface.ts`, `cite-id.decorator.ts`, `current-user.decorator.ts`, `auth.controller.ts`, `.createPaystackSubaccount`, `.update`, `RequireFeature`, `AnnonceController`, `AuthController`, `feed.service.ts`, `NotificationController`, `alerte-securite.controller.ts`, `PaiementManuelDto`, `audit-log.interceptor.ts`, `.summary`, `villa.controller.ts`, `.preview`, `villa-occupancy.guard.ts`?**
  _High betweenness centrality (0.175) - this node is a cross-community bridge._
- **Why does `PrismaService` connect `PrismaService` to `AuthenticatedRequest`, `conflit.controller.ts`, `feed.e2e-spec.ts`, `UserController`, `CiteController`, `authenticated-request.interface.ts`, `NotifService`, `.update`, `RequireFeature`, `CriteriaService`, `mail-templates.ts`, `AnnonceController`, `feed.service.ts`, `.paystack`, `AuthService`, `alerte-securite.controller.ts`, `audit-log.interceptor.ts`, `PaystackClientService`, `.summary`, `auth.service.ts`, `generate-postman.ts`, `paiement.e2e-spec.ts`, `MessageService`, `document.service.ts`, `PaiementService`, `paiement.service.ts`, `.constructor`, `villa.controller.ts`, `CreateSubaccountDto`, `FilesPreviewController`, `StorageService`, `message.service.ts`, `villa-occupancy.guard.ts`?**
  _High betweenness centrality (0.138) - this node is a cross-community bridge._
- **Why does `dependencies` connect `dependencies` to `minio`, `nodemailer`, `qrcode`, `@socket.io/redis-adapter`, `package.json`, `@prisma/client`, `class-transformer`, `class-validator`, `ioredis`, `mongoose`, `@nestjs/config`, `@nestjs/core`, `@nestjs/jwt`, `@nestjs/passport`, `nestjs-pino`, `@nestjs/platform-express`, `@nestjs/platform-socket.io`, `@nestjs/swagger`, `@nestjs/websockets`, `passport`, `pdfkit`, `pg`, `pino`, `reflect-metadata`, `@resvg/resvg-js`, `rxjs`, `socket.io`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **What connects `zz-init-test-db.sh script`, `$schema`, `collection` to the rest of the system?**
  _236 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `AuthenticatedRequest` be split into smaller, more focused modules?**
  _Cohesion score 0.09855072463768116 - nodes in this community are weakly interconnected._
- **Should `PaiementController` be split into smaller, more focused modules?**
  _Cohesion score 0.14482758620689656 - nodes in this community are weakly interconnected._