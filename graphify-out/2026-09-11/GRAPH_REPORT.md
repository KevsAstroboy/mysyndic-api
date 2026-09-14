# Graph Report - .  (2026-09-11)

## Corpus Check
- 234 files · ~205,190 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1644 nodes · 3670 edges · 127 communities (75 shown, 52 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 95 edges (avg confidence: 0.83)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Notification & Shared API
- Dashboard Module
- Conflit Management
- Alerte Securite
- Message Content Service
- Document Management
- Auth API Decorators
- E2E Test Suite
- Cite Management
- Criteria & Request Decorators
- Logging & Messaging Specs
- Sprint 1 Foundation
- Common & Notification Services
- Auth & JWT Core
- Configuration Management
- Profile Features
- Incident Management
- Incident DTOs
- Error Handling
- Criteria Query Builder
- Mail & QR Generation
- Annonce Module
- Auth Controller
- Annonce API
- Webhook HMAC
- Password Guard & Public Onboarding
- Module Generator Tool
- Auth Service Logic
- Sprint 4 Messaging Design
- Notification Management
- User DTOs
- TS Configuration
- Payment DTOs
- Build Scripts
- Test Tooling
- Migration Runner
- Shared DTO Validation
- Audit & Webhook Services
- Screens & API Docs
- Chat Gateway
- Sprint 5 Logging Design
- Paystack Client
- Feature Module Wiring
- Mail Service
- Registration Flow
- OpenSpec Tooling
- Design System
- Postman Generator
- Messaging Screens & Infra
- Runtime Dependencies
- Incident Spec
- Payment E2E Tests
- Brand Identity
- TS Build Config
- Document Upload
- Payment & Security Specs
- Incident Create DTO
- Excel Export Service
- Logo Design (Green)
- Nest CLI Config
- Package Manifest
- Auth Response DTOs
- Villa DTOs
- Admin & Auth API Docs
- Database Migrations
- Incident Spec Delta
- Prisma Seed
- Common Module
- Cite Filter Interceptor
- Mail Module
- Staff Account Creation
- Redis Module
- Sockets Module
- Storage Module
- Payment Webhook Spec
- Logger Config
- Alerte Module
- Auth Module
- Notification Module
- User Module
- Prisma Module
- bcryptjs Dependency
- class-transformer Dependency
- class-validator Dependency
- Test DB Init Script
- ioredis Dependency
- mongoose Dependency
- @nestjs/common Dependency
- @nestjs/config Dependency
- @nestjs/core Dependency
- @nestjs/jwt Dependency
- @nestjs/passport Dependency
- nestjs-pino Dependency
- @nestjs/platform-express Dependency
- @nestjs/platform-socket.io Dependency
- @nestjs/schematics Dependency
- @nestjs/swagger Dependency
- @nestjs/testing Dependency
- @nestjs/websockets Dependency
- passport Dependency
- passport-jwt Dependency
- pdfkit Dependency
- pg Dependency
- pino Dependency
- reflect-metadata Dependency
- @resvg/resvg-js Dependency
- rxjs Dependency
- socket.io Dependency
- pino-pretty Dependency
- prettier Dependency
- prisma Dependency
- socket.io-client Dependency
- supertest Dependency
- ts-node Dependency
- tsconfig-paths Dependency
- @types/bcrypt Dependency
- @types/bcryptjs Dependency
- @types/jest Dependency
- @types/multer Dependency
- @types/node Dependency
- @types/passport-jwt Dependency
- @types/qrcode Dependency
- @types/supertest Dependency
- typescript Dependency
- Docker Compose Stack
- MinIO Storage
- Payment Receipt

## God Nodes (most connected - your core abstractions)
1. `AuthenticatedRequest` - 124 edges
2. `PrismaService` - 89 edges
3. `RequireFeature()` - 88 edges
4. `VillaService` - 43 edges
5. `AuthService` - 32 edges
6. `PaiementService` - 26 edges
7. `VillaController` - 26 edges
8. `IsFlexibleUuid()` - 23 edges
9. `StorageService` - 23 edges
10. `setupTestApp()` - 22 edges

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
- **MySyndic Brand Identity System** — design_logo_mysyndic_isol____fichier_png_logo, mysyndic_brand, mysyndic_ms_monogram, concept_home_house, concept_key_access, concept_blue_gradient_palette [INFERRED 0.85]
- **MySyndic Brand Identity System** — design_logo_mysyndic_isol_vert___fichier_png_logo, design_logo_mysyndic_isol_vert___fichier_png_mysyndic_brand, design_logo_mysyndic_isol_vert___fichier_png_house_signpost, design_logo_mysyndic_isol_vert___fichier_png_green_palette [INFERRED 0.85]

## Communities (127 total, 52 thin omitted)

### Community 0 - "Notification & Shared API"
Cohesion: 0.09
Nodes (20): Inject, ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags, Body, Controller (+12 more)

### Community 1 - "Dashboard Module"
Cohesion: 0.06
Nodes (33): DashboardController, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, Controller, Get, Query (+25 more)

### Community 2 - "Conflit Management"
Cohesion: 0.07
Nodes (34): ConflitController, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, Body, Controller, Get (+26 more)

### Community 3 - "Alerte Securite"
Cohesion: 0.07
Nodes (33): AlerteController, ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags, Body, Controller (+25 more)

### Community 4 - "Message Content Service"
Cohesion: 0.07
Nodes (29): MessageContent, MessageContentService, Injectable, SendGroupeMessageDto, ApiProperty, IsNotEmpty, IsString, SendPrivateMessageDto (+21 more)

### Community 5 - "Document Management"
Cohesion: 0.06
Nodes (31): DocumentController, ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags, Body, Controller (+23 more)

### Community 6 - "Auth API Decorators"
Cohesion: 0.12
Nodes (23): JwtUser, ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags, Body (+15 more)

### Community 7 - "E2E Test Suite"
Cohesion: 0.09
Nodes (7): createStaffWithTempPassword(), login(), PNG_1PX, setupTestApp(), TEST_CITE_ID, TEST_USERS, TEST_VILLA_ID

### Community 8 - "Cite Management"
Cohesion: 0.09
Nodes (27): CiteController, ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags, Body, Controller (+19 more)

### Community 9 - "Criteria & Request Decorators"
Cohesion: 0.18
Nodes (16): CriteriaService, PrismaDelegate, Injectable, CiteId, CurrentUser, FEATURE_KEY, JwtAuthGuard, Injectable (+8 more)

### Community 10 - "Logging & Messaging Specs"
Cohesion: 0.07
Nodes (40): Logging Spec, Correlation id par requete, Journalisation des requetes HTTP, Logging structure JSON (pino), Niveaux configurables LOG_LEVEL, Redaction des donnees sensibles, Messagerie Spec, Historique des conversations (+32 more)

### Community 11 - "Sprint 1 Foundation"
Cohesion: 0.06
Nodes (39): NestJS Sprint 1 Change, Audit Log Interceptor, cite_id Scoping Decorator and Interceptor, JWT Payload MySyndic, generate-module.ts Generator, Prisma ORM (db pull), Redis Sessions and RBAC Cache, Multi-Tenant Security Socle (+31 more)

### Community 12 - "Common & Notification Services"
Cohesion: 0.09
Nodes (14): RequestIdMiddleware, Injectable, NotifService, SendNotifParams, SendToCiteOptions, Injectable, IMAGE_MIME_TO_EXT, isUploadEmpty() (+6 more)

### Community 13 - "Auth & JWT Core"
Cohesion: 0.09
Nodes (23): Length, JwtPayload, ActivateAccountDto, ResendActivationOtpDto, ApiProperty, IsEmail, IsString, ChangePasswordDto (+15 more)

### Community 14 - "Configuration Management"
Cohesion: 0.09
Nodes (27): Max, ConfigurationController, ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags, Body (+19 more)

### Community 15 - "Profile Features"
Cohesion: 0.08
Nodes (23): Put, ApiProperty, ArrayMinSize, IsArray, IsString, UpdateProfilFeaturesDto, ProfilFeatureController, ApiBearerAuth (+15 more)

### Community 16 - "Incident Management"
Cohesion: 0.19
Nodes (19): RequireFeature(), IncidentController, ApiBearerAuth, ApiConsumes, ApiOperation, ApiResponse, ApiTags, Body (+11 more)

### Community 17 - "Incident DTOs"
Cohesion: 0.11
Nodes (13): CommentaireDto, ApiProperty, IsString, MaxLength, NoteSyndicIncidentDto, PrendreEnChargeIncidentDto, ResoudreIncidentDto, ApiProperty (+5 more)

### Community 18 - "Error Handling"
Cohesion: 0.11
Nodes (19): Catch, extractFkColumn(), findLabelBySuffix(), FK_LABELS, GlobalExceptionFilter, handlePrismaError(), DateFormatInterceptor, isRawResponse() (+11 more)

### Community 19 - "Criteria Query Builder"
Cohesion: 0.15
Nodes (12): BuiltQuery, CriteriaBuilder, extractRelations(), extractScalars(), isValidColumn(), isValidRelation(), CriteriaParser, OPERATOR_MAP (+4 more)

### Community 20 - "Mail & QR Generation"
Cohesion: 0.12
Nodes (19): qrcode, qrcode, FONT_FILE_BOLD, FONT_FILE_REGULAR, THEME, SMTP_IPS, escapeAttr(), escapeHtml() (+11 more)

### Community 21 - "Annonce Module"
Cohesion: 0.10
Nodes (16): AnnonceModule, Module, AnnonceService, Injectable, CreateAnnonceDto, ApiProperty, ApiPropertyOptional, IsBoolean (+8 more)

### Community 22 - "Auth Controller"
Cohesion: 0.24
Nodes (13): AuthController, ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags, Body, Controller (+5 more)

### Community 23 - "Annonce API"
Cohesion: 0.15
Nodes (16): PaginatedResponse, AnnonceController, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, Body, Controller (+8 more)

### Community 24 - "Webhook HMAC"
Cohesion: 0.11
Nodes (15): Headers, verifyHmacSignature(), ApiOperation, ApiTags, Controller, HttpCode, Post, Req (+7 more)

### Community 25 - "Password Guard & Public Onboarding"
Cohesion: 0.12
Nodes (12): IS_PUBLIC_KEY, MustChangePasswordGuard, Public(), Injectable, PublicOnboardingController, ApiOperation, ApiTags, Controller (+4 more)

### Community 26 - "Module Generator Tool"
Cohesion: 0.16
Nodes (21): exampleFor(), EXCLUDE_MODELS, extractMeta(), generateModule(), humanLabel(), listModels(), main(), ModelMeta (+13 more)

### Community 27 - "Auth Service Logic"
Cohesion: 0.18
Nodes (6): Inject, AuthService, Injectable, SessionCache, SessionOptions, SessionProfil

### Community 28 - "Sprint 4 Messaging Design"
Cohesion: 0.15
Nodes (21): Sprint 4 - OpenSpec Metadata, Sprint 4 - Design, ChatGateway (socket.io global), Systematic Cite Scoping (cite_id), MessageContentService (MongoDB driver), MinIO StorageService, NotifService.sendToCite (targeted diffusion), notification:new Socket Event (+13 more)

### Community 29 - "Notification Management"
Cohesion: 0.21
Nodes (12): NotificationController, ApiBearerAuth, ApiOperation, ApiResponse, ApiTags, Controller, Get, Param (+4 more)

### Community 30 - "User DTOs"
Cohesion: 0.18
Nodes (19): AssignProfilItemDto, AssignProfilsDto, CreateAdminDto, CreateStaffDto, ApiProperty, ApiPropertyOptional, ArrayMaxSize, ArrayMinSize (+11 more)

### Community 31 - "TS Configuration"
Cohesion: 0.10
Nodes (19): compilerOptions, allowSyntheticDefaultImports, baseUrl, declaration, emitDecoratorMetadata, experimentalDecorators, forceConsistentCasingInFileNames, incremental (+11 more)

### Community 32 - "Payment DTOs"
Cohesion: 0.14
Nodes (18): CanalCode, CANAUX_MANUELS, InitPaystackDto, PaiementManuelDto, PaiementRechercheDto, ApiProperty, ApiPropertyOptional, ArrayMaxSize (+10 more)

### Community 33 - "Build Scripts"
Cohesion: 0.11
Nodes (18): scripts, build, db:setup, db:sync, format, lint, migrate:run, postman:generate (+10 more)

### Community 34 - "Test Tooling"
Cohesion: 0.12
Nodes (17): jest, @nestjs/cli, devDependencies, jest, @nestjs/cli, source-map-support, ts-jest, @types/express (+9 more)

### Community 35 - "Migration Runner"
Cohesion: 0.17
Nodes (11): main(), listMigrationFiles(), MigrationOptions, MigrationResult, MigrationRunner, resolveMigrationsDir(), sleep(), MigrationService (+3 more)

### Community 36 - "Shared DTO Validation"
Cohesion: 0.24
Nodes (7): RFC-412, IsFlexibleUuid(), SwitchContextDto, ApiProperty, AssignUserDto, CandidatureVillaDto, ApiProperty

### Community 37 - "Audit & Webhook Services"
Cohesion: 0.13
Nodes (6): AuditLogInterceptor, Injectable, Inject, StoredWebhookPayload, PrismaService, Injectable

### Community 38 - "Screens & API Docs"
Cohesion: 0.22
Nodes (14): Security Chief Alert Flow, Incidents, Annonces & Conflits Screens, Annonces Screens (Habitant & Syndic), Conflits Moderation Screen, get-by-criteria DSL, DSL Filter Operators, Paginated Response Envelope, Alertes API (+6 more)

### Community 39 - "Chat Gateway"
Cohesion: 0.15
Nodes (6): MessageBody, Inject, ChatGateway, SubscribeMessage, WebSocketGateway, WebSocketServer

### Community 40 - "Sprint 5 Logging Design"
Cohesion: 0.20
Nodes (14): Sprint 5 - OpenSpec Metadata, Sprint 5 - Design, DateFormatInterceptor, GlobalExceptionFilter, nestjs-pino + pino, Sprint 5 - Proposal, Sprint 5 - API Response Clean Spec (delta), StripNullInterceptor (+6 more)

### Community 41 - "Paystack Client"
Cohesion: 0.15
Nodes (4): InitializePaymentParams, PaystackClientService, PaystackInitializeResponse, Injectable

### Community 42 - "Feature Module Wiring"
Cohesion: 0.26
Nodes (8): ConfigurationModule, Module, DashboardModule, Module, IncidentModule, Module, PaiementModule, Module

### Community 43 - "Mail Service"
Cohesion: 0.19
Nodes (6): MailService, Injectable, generateOtpCode(), ForgotPasswordDto, ApiProperty, IsEmail

### Community 44 - "Registration Flow"
Cohesion: 0.23
Nodes (7): RegisterDto, ApiProperty, IsEmail, IsOptional, IsString, Matches, MinLength

### Community 45 - "OpenSpec Tooling"
Cohesion: 0.24
Nodes (11): opsx-apply Command, opsx-archive Command, opsx-explore Command, opsx-propose Command, opsx-sync Command, openspec-apply-change Skill, openspec-archive-change Skill, openspec-explore Skill (+3 more)

### Community 46 - "Design System"
Cohesion: 0.18
Nodes (11): Design System Recap (Tokens, Motion), Payment Management Desktop Screen, Tailwind CSS Variables, Design Component System, MySyndic Design Tokens, Habitant Mobile Home Screen, Tropical Teal Palette, Syndic Desktop Dashboard (+3 more)

### Community 47 - "Postman Generator"
Cohesion: 0.38
Nodes (9): bodyFor(), buildRequest(), FILE_FIELDS, itemFor(), main(), PROFIL_LABELS, resolveRef(), sampleObject() (+1 more)

### Community 48 - "Messaging Screens & Infra"
Cohesion: 0.31
Nodes (9): Private & Cite Messaging Screens, Habitant Profile & Documents Screen, MySyndic API Service, MinIO Service, MongoDB Service, API Environment Override, Redis Service, Documents API (+1 more)

### Community 49 - "Runtime Dependencies"
Cohesion: 0.22
Nodes (9): exceljs, minio, nodemailer, dependencies, exceljs, minio, nodemailer, @socket.io/redis-adapter (+1 more)

### Community 50 - "Incident Spec"
Cohesion: 0.22
Nodes (9): Incident Spec, Commentaires arborescents 2 niveaux, Feature INCIDENT_COMMENT, Feature INCIDENT_CREATE, Feature INCIDENT_LIKE, Feature INCIDENT_READ, Liste et detail d'un incident, Likes sur un incident (toggle) (+1 more)

### Community 51 - "Payment E2E Tests"
Cohesion: 0.28
Nodes (6): test, AppModule, Module, setupPaiementApp(), cleanTestDb(), seedTestData()

### Community 52 - "Brand Identity"
Cohesion: 0.36
Nodes (8): Blue Gradient Visual Identity, Coproperty / Syndic Management, House / Home, Key / Access, MySyndic Logo (isolated PNG), mysyndic-api Project, MySyndic Brand, MS Monogram

### Community 53 - "TS Build Config"
Cohesion: 0.25
Nodes (7): dist, node_modules, **/*spec.ts, test, ./tsconfig.json, exclude, extends

### Community 54 - "Document Upload"
Cohesion: 0.29
Nodes (6): MIME_TO_EXT, ApiProperty, IsNotEmpty, IsString, MaxLength, UploadDocumentDto

### Community 55 - "Payment & Security Specs"
Cohesion: 0.33
Nodes (7): Super Admin Multi-Cite View, Session Cite Security Scoping, Paystack Payment Integration, Paystack Webhook (HMAC-SHA512), Sprint 2 Release (Payment + Webhook), Paystack Subaccount per Cite, Cites API

### Community 56 - "Incident Create DTO"
Cohesion: 0.29
Nodes (7): CreateIncidentDto, ApiProperty, ApiPropertyOptional, IsInt, IsOptional, IsString, MaxLength

### Community 57 - "Excel Export Service"
Cohesion: 0.29
Nodes (5): COLORS, ExcelExportService, PaiementExportRow, Injectable, Inject

### Community 58 - "Logo Design (Green)"
Cohesion: 0.47
Nodes (6): Green Color Palette (light to dark gradient), House Outline With MS Monogram On Post, MySyndic Logo (green isolated), MS Monogram, MySyndic Brand, Syndic / Property Management Concept

### Community 59 - "Nest CLI Config"
Cohesion: 0.33
Nodes (5): collection, compilerOptions, deleteOutDir, $schema, sourceRoot

### Community 60 - "Package Manifest"
Cohesion: 0.33
Nodes (5): description, license, name, private, version

### Community 61 - "Auth Response DTOs"
Cohesion: 0.60
Nodes (5): AuthProfilDto, AuthResponseDto, AuthUserDto, ApiProperty, ApiPropertyOptional

### Community 62 - "Villa DTOs"
Cohesion: 0.47
Nodes (6): CreateVillaDto, ApiPropertyOptional, IsOptional, IsString, MinLength, UpdateVillaDto

### Community 63 - "Admin & Auth API Docs"
Cohesion: 0.50
Nodes (5): Admin Console Account Management, Login & Onboarding Screens, Auth & Public API, RBAC Profile Groups, Users API

### Community 64 - "Database Migrations"
Cohesion: 0.60
Nodes (5): PostgreSQL Service, Prisma Sync Service, Migration Runner Service, schema_migrations Table, Versioned SQL Migrations

### Community 65 - "Incident Spec Delta"
Cohesion: 0.40
Nodes (5): Sprint 3 - Incident Spec (delta), Incident Threaded Comments (max depth 2), Incident Likes (toggle, composite PK), Sprint 3 - Tasks, Conflit Spec

### Community 66 - "Prisma Seed"
Cohesion: 0.50
Nodes (3): @prisma/client, @prisma/client, main()

### Community 67 - "Common Module"
Cohesion: 0.50
Nodes (3): CommonModule, Global, Module

### Community 69 - "Mail Module"
Cohesion: 0.50
Nodes (3): MailModule, Global, Module

### Community 71 - "Redis Module"
Cohesion: 0.50
Nodes (3): RedisModule, Global, Module

### Community 72 - "Sockets Module"
Cohesion: 0.50
Nodes (3): SocketsModule, Global, Module

### Community 73 - "Storage Module"
Cohesion: 0.50
Nodes (3): StorageModule, Global, Module

### Community 74 - "Payment Webhook Spec"
Cohesion: 0.67
Nodes (3): Async Webhook Processing, Manual Payment Entry, Paiement Webhook Capability

### Community 77 - "Auth Module"
Cohesion: 0.67
Nodes (3): AuthModule, Global, Module

### Community 80 - "Prisma Module"
Cohesion: 0.67
Nodes (3): PrismaModule, Global, Module

## Ambiguous Edges - Review These
- `MySyndic Design Tokens` → `spec-driven OpenSpec Schema`  [AMBIGUOUS]
  design/mysyndic-design.html · relation: conceptually_related_to

## Knowledge Gaps
- **210 isolated node(s):** `zz-init-test-db.sh script`, `$schema`, `collection`, `sourceRoot`, `deleteOutDir` (+205 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **52 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `MySyndic Design Tokens` and `spec-driven OpenSpec Schema`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `AuthenticatedRequest` connect `Criteria & Request Decorators` to `Notification & Shared API`, `Dashboard Module`, `Conflit Management`, `Alerte Securite`, `Message Content Service`, `Document Management`, `Auth API Decorators`, `Auth & JWT Core`, `Configuration Management`, `Profile Features`, `Incident Management`, `Auth Controller`, `Annonce API`, `Notification Management`?**
  _High betweenness centrality (0.181) - this node is a cross-community bridge._
- **Why does `PrismaService` connect `Audit & Webhook Services` to `Notification & Shared API`, `Dashboard Module`, `Conflit Management`, `Message Content Service`, `Document Management`, `Auth API Decorators`, `E2E Test Suite`, `Cite Management`, `Criteria & Request Decorators`, `Common & Notification Services`, `Auth & JWT Core`, `Profile Features`, `Annonce Module`, `Webhook HMAC`, `Password Guard & Public Onboarding`, `Auth Service Logic`, `Notification Management`, `User DTOs`, `Chat Gateway`, `Paystack Client`, `Registration Flow`, `Postman Generator`, `Payment E2E Tests`, `Document Upload`, `Excel Export Service`, `Staff Account Creation`?**
  _High betweenness centrality (0.142) - this node is a cross-community bridge._
- **Why does `dependencies` connect `Runtime Dependencies` to `Mail & QR Generation`, `Package Manifest`, `Prisma Seed`, `bcryptjs Dependency`, `class-transformer Dependency`, `class-validator Dependency`, `ioredis Dependency`, `mongoose Dependency`, `@nestjs/common Dependency`, `@nestjs/config Dependency`, `@nestjs/core Dependency`, `@nestjs/jwt Dependency`, `@nestjs/passport Dependency`, `nestjs-pino Dependency`, `@nestjs/platform-express Dependency`, `@nestjs/platform-socket.io Dependency`, `@nestjs/swagger Dependency`, `@nestjs/websockets Dependency`, `passport Dependency`, `passport-jwt Dependency`, `pdfkit Dependency`, `pg Dependency`, `pino Dependency`, `reflect-metadata Dependency`, `@resvg/resvg-js Dependency`, `rxjs Dependency`, `socket.io Dependency`?**
  _High betweenness centrality (0.083) - this node is a cross-community bridge._
- **What connects `zz-init-test-db.sh script`, `$schema`, `collection` to the rest of the system?**
  _210 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Notification & Shared API` be split into smaller, more focused modules?**
  _Cohesion score 0.08724569640062597 - nodes in this community are weakly interconnected._
- **Should `Dashboard Module` be split into smaller, more focused modules?**
  _Cohesion score 0.05961538461538462 - nodes in this community are weakly interconnected._