-- ============================================================
-- MySyndic DB — Version 3.0
-- Script SQL idempotent — réexécutable sans erreur
-- Compatible docker-compose / Railway / Supabase (PostgreSQL 16)
-- Auteur : MySyndic — Kevin DIAKITE
-- Date   : Septembre 2026
-- ============================================================
-- CHANGEMENTS v3 (delta sur v2) :
--   [1] MinIO stockage : les tables gardent seulement un file_path relatif
--       (ex: 'alertes/cite_id/uuid.jpg'). Le bucket est résolu côté service
--       depuis app_config (MINIO_BUCKET_DOCUMENTS / MINIO_BUCKET_MEDIA).
--       Pas de champ bucket dans les tables métier.
--       Tables concernées : user (photo_file_path), paiement (preuve_file_path),
--       recu_paiement (file_path), alerte_securite
--       (photo_file_path), incident (photo_file_path), document (file_path).
--   [2] Versioning features : profil_feature_version (snapshot JSONB
--       horodaté de chaque jeu de features par profil)
--   [3] Multi-profil user : table user_profil (un user peut avoir
--       N profils actifs) + profil_id retiré de user
--   [4] Sélection de vue : profil_actif_code dans la session Redis
--       (pas en DB — volatile par nature) + endpoint POST /auth/switch-profil
--   [5] Gmail SMTP pour OTP : config dans app_config (SMTP_HOST, GMAIL_USER…).
--       Table otp simplifiée : juste un champ contexte VARCHAR, pas de FK otp_type.
--   [6] Agrégateur webhook paramétré dans app_config (WEBHOOK_AGGREGATEUR_ACTIF).
--       webhook.aggregateur_code = copie dénormalisée au moment de la réception.
--   [7] Paystack subaccounts par cité : clés master globalisées dans app_config
--       (PAYSTACK_SECRET_KEY / PAYSTACK_CURRENCY). La clé publique Paystack
--       n'est pas requise côté backend (checkout navigateur uniquement).
--       configuration porte subaccount_code + mode (SIMPLE/SPLIT) + split ratio,
--       tous réservés SUPER_ADMIN. WEBHOOK_PAYSTACK_SECRET supprimé (redondant).
--       webhook.montant_match = generated column calculée par PostgreSQL.
-- ============================================================

BEGIN;

-- ============================================================
-- EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";   -- gen_random_uuid()

-- ============================================================
-- 1. TABLES DE RÉFÉRENCE INDÉPENDANTES
-- ============================================================

-- Profils / Rôles
CREATE TABLE IF NOT EXISTS profil (
    id          INT4 PRIMARY KEY,
    libelle     VARCHAR(255),
    code        VARCHAR(100) UNIQUE NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP,
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_by  INT4,
    updated_by  INT4,
    deleted_by  INT4
);

-- Features (permissions granulaires)
CREATE TABLE IF NOT EXISTS feature (
    id          SERIAL4 PRIMARY KEY,
    libelle     VARCHAR(255),
    code        VARCHAR(100) UNIQUE NOT NULL,
    module      VARCHAR(100),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP,
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_by  INT4,
    updated_by  INT4,
    deleted_by  INT4
);

-- ── [NOUVEAU v3] Liaison profil ↔ feature — versionnée ────────
-- Chaque ligne = une feature active pour un profil.
-- version_tag : étiquette sémantique (ex: 'v1.0', 'v1.1-beta').
-- valid_from / valid_until : plage de validité (NULL = toujours valide).
-- La vue active = is_deleted = FALSE AND valid_from <= NOW()
--                AND (valid_until IS NULL OR valid_until > NOW())
CREATE TABLE IF NOT EXISTS profil_feature (
    id          SERIAL4 PRIMARY KEY,
    profil_id   INT4 NOT NULL REFERENCES profil(id),
    feature_id  INT4 NOT NULL REFERENCES feature(id),
    version_tag VARCHAR(50) NOT NULL DEFAULT 'v1.0',
    valid_from  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_until TIMESTAMP,                         -- NULL = pas de fin prévue
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP,
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_by  INT4,
    updated_by  INT4,
    deleted_by  INT4,
    UNIQUE (profil_id, feature_id, version_tag)    -- une seule entrée par version
);

-- ── [NOUVEAU v3] Snapshot versionné du jeu de features d'un profil ─
-- Enregistré automatiquement à chaque changement (trigger ou service).
-- Sert d'audit et de rollback : on peut réactiver un snapshot précédent.
CREATE TABLE IF NOT EXISTS profil_feature_version (
    id              SERIAL4 PRIMARY KEY,
    profil_id       INT4 NOT NULL REFERENCES profil(id),
    version_tag     VARCHAR(50) NOT NULL,           -- ex: 'v1.0', 'v1.2'
    features_snapshot JSONB NOT NULL,               -- tableau des codes feature actifs
    -- ex: ["AUTH_LOGIN","PAIEMENT_READ_OWN","ALERTE_CREATE"]
    note            TEXT,                           -- raison du changement (optionnel)
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by      INT4,
    UNIQUE (profil_id, version_tag)
);

-- Cités résidentielles (multi-tenant)
CREATE TABLE IF NOT EXISTS cite (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nom         VARCHAR(255) NOT NULL,
    ville       VARCHAR(255),
    pays        VARCHAR(100) DEFAULT 'Côte d''Ivoire',
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP,
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_by  UUID,
    updated_by  UUID,
    deleted_by  UUID
);

-- Villas (entité propre — plusieurs users possible par villa)
CREATE TABLE IF NOT EXISTS villa (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cite_id     UUID NOT NULL REFERENCES cite(id),
    numero      VARCHAR(50) NOT NULL,
    rue         VARCHAR(255),
    description TEXT,
    is_active   BOOLEAN DEFAULT TRUE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP,
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_by  UUID,
    updated_by  UUID,
    deleted_by  UUID,
    UNIQUE (cite_id, numero)
);

-- ── [MODIFIÉ v3] User — profil_id retiré (maintenant dans user_profil) ─
-- Un user peut avoir plusieurs profils via user_profil.
-- La sélection du profil actif est gérée dans Redis (session).
CREATE TABLE IF NOT EXISTS "user" (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cite_id              UUID REFERENCES cite(id),
    prenom               VARCHAR(255) NOT NULL,
    nom                  VARCHAR(255) NOT NULL,
    email                VARCHAR(255) NOT NULL UNIQUE,
    telephone            VARCHAR(50),
    password_hash        VARCHAR(255) NOT NULL,
    must_change_password BOOLEAN DEFAULT FALSE,
    -- Chemin relatif MinIO : bucket résolu depuis app_config (MINIO_BUCKET_MEDIA)
    photo_file_path      VARCHAR(500),              -- ex: 'avatars/uuid.jpg'
    is_active            BOOLEAN DEFAULT TRUE,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP,
    deleted_at           TIMESTAMP,
    is_deleted           BOOLEAN DEFAULT FALSE,
    created_by           UUID,
    updated_by           UUID,
    deleted_by           UUID
);

-- ── [NOUVEAU v3] Liaison user ↔ profil (multi-profil) ─────────
-- Un user peut avoir N profils actifs dans la même cité ou non.
-- Exemples :
--   - Germain est SUPER_ADMIN + ADMIN de Synacassy 1
--   - Ama est SYNDIC + HABITANT dans sa propre cité
-- profil_actif par défaut : le premier profil assigné (order_priority = 1)
-- La sélection dynamique est dans Redis, pas en DB.
CREATE TABLE IF NOT EXISTS user_profil (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES "user"(id),
    profil_id       INT4 NOT NULL REFERENCES profil(id),
    cite_id         UUID REFERENCES cite(id),       -- NULL si profil global (SUPER_ADMIN)
    order_priority  INT2 NOT NULL DEFAULT 1,         -- 1 = profil par défaut proposé au login
    is_active       BOOLEAN DEFAULT TRUE,
    assigned_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by     UUID,
    revoked_at      TIMESTAMP,
    revoked_by      UUID,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP,
    deleted_at      TIMESTAMP,
    is_deleted      BOOLEAN DEFAULT FALSE,
    created_by      UUID,
    updated_by      UUID,
    deleted_by      UUID,
    UNIQUE (user_id, profil_id, cite_id)            -- un profil donné une fois par user/cité
);

-- Liaison user ↔ villa (historique)
CREATE TABLE IF NOT EXISTS user_villa (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES "user"(id),
    villa_id    UUID NOT NULL REFERENCES villa(id),
    cite_id     UUID NOT NULL REFERENCES cite(id),
    is_current  BOOLEAN DEFAULT TRUE,
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    assigned_by UUID,
    revoked_at  TIMESTAMP,
    revoked_by  UUID,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP,
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_by  UUID,
    updated_by  UUID,
    deleted_by  UUID
);

-- Configuration par cité
CREATE TABLE IF NOT EXISTS configuration (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cite_id                 UUID NOT NULL UNIQUE REFERENCES cite(id),
    cotisation_mensuelle    INT4,
    lien_wave               VARCHAR(500),
    telephone_syndic        VARCHAR(50),
    telephone_urgence       VARCHAR(50),
    -- Subaccount Paystack de la cité — créé/géré par SUPER_ADMIN (champs réservés)
    paystack_subaccount_code   VARCHAR(255),
    paystack_subaccount_mode   VARCHAR(10)  DEFAULT 'SIMPLE',
    paystack_subaccount_split  INT4         DEFAULT 100,
    nombre_villas_attendu   INT4,
    created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMP,
    deleted_at              TIMESTAMP,
    is_deleted              BOOLEAN DEFAULT FALSE,
    created_by              UUID,
    updated_by              UUID,
    deleted_by              UUID,
    CONSTRAINT ck_subaccount_mode  CHECK (paystack_subaccount_mode  IN ('SIMPLE','SPLIT')),
    CONSTRAINT ck_subaccount_split CHECK (paystack_subaccount_split BETWEEN 1 AND 100)
);

-- ============================================================
-- 2. TABLES DE RÉFÉRENCE MÉTIER (ID fixes — seed)
-- ============================================================

CREATE TABLE IF NOT EXISTS canal_paiement (
    id          INT4 PRIMARY KEY,
    libelle     VARCHAR(255),
    code        VARCHAR(100) UNIQUE NOT NULL,
    is_manuel   BOOLEAN DEFAULT FALSE,
    created_at  TIMESTAMP,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP,
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_by  INT4,
    updated_by  INT4,
    deleted_by  INT4
);

CREATE TABLE IF NOT EXISTS statut_paiement (
    id          INT4 PRIMARY KEY,
    libelle     VARCHAR(255),
    code        VARCHAR(100) UNIQUE NOT NULL,
    created_at  TIMESTAMP,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP,
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_by  INT4,
    updated_by  INT4,
    deleted_by  INT4
);

CREATE TABLE IF NOT EXISTS motif_alerte (
    id          INT4 PRIMARY KEY,
    libelle     VARCHAR(255),
    code        VARCHAR(100) UNIQUE NOT NULL,
    created_at  TIMESTAMP,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP,
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_by  INT4,
    updated_by  INT4,
    deleted_by  INT4
);

CREATE TABLE IF NOT EXISTS statut_alerte (
    id          INT4 PRIMARY KEY,
    libelle     VARCHAR(255),
    code        VARCHAR(100) UNIQUE NOT NULL,
    created_at  TIMESTAMP,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP,
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_by  INT4,
    updated_by  INT4,
    deleted_by  INT4
);

CREATE TABLE IF NOT EXISTS categorie_incident (
    id          INT4 PRIMARY KEY,
    libelle     VARCHAR(255),
    code        VARCHAR(100) UNIQUE NOT NULL,
    icon_name   VARCHAR(100),
    created_at  TIMESTAMP,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP,
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_by  INT4,
    updated_by  INT4,
    deleted_by  INT4
);

CREATE TABLE IF NOT EXISTS categorie_conflit (
    id          INT4 PRIMARY KEY,
    libelle     VARCHAR(255),
    code        VARCHAR(100) UNIQUE NOT NULL,
    created_at  TIMESTAMP,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP,
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_by  INT4,
    updated_by  INT4,
    deleted_by  INT4
);

CREATE TABLE IF NOT EXISTS statut_conflit (
    id          INT4 PRIMARY KEY,
    libelle     VARCHAR(255),
    code        VARCHAR(100) UNIQUE NOT NULL,
    created_at  TIMESTAMP,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP,
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_by  INT4,
    updated_by  INT4,
    deleted_by  INT4
);

CREATE TABLE IF NOT EXISTS type_document (
    id          INT4 PRIMARY KEY,
    libelle     VARCHAR(100),
    code        VARCHAR(50) UNIQUE NOT NULL,
    extension   VARCHAR(10),
    created_at  TIMESTAMP,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP,
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_by  INT4,
    updated_by  INT4,
    deleted_by  INT4
);

CREATE TABLE IF NOT EXISTS categorie_annonce (
    id          INT4 PRIMARY KEY,
    libelle     VARCHAR(255),
    code        VARCHAR(100) UNIQUE NOT NULL,
    created_at  TIMESTAMP,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP,
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_by  INT4,
    updated_by  INT4,
    deleted_by  INT4
);

CREATE TABLE IF NOT EXISTS type_notification (
    id          INT4 PRIMARY KEY,
    libelle     VARCHAR(255),
    code        VARCHAR(100) UNIQUE NOT NULL,
    created_at  TIMESTAMP,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP,
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_by  INT4,
    updated_by  INT4,
    deleted_by  INT4
);

-- ============================================================
-- 3. PAIEMENT (lié à la villa)
-- ============================================================

CREATE TABLE IF NOT EXISTS paiement (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cite_id             UUID NOT NULL REFERENCES cite(id),
    villa_id            UUID NOT NULL REFERENCES villa(id),
    saisi_par           UUID REFERENCES "user"(id),
    mois                VARCHAR(7) NOT NULL,
    montant             INT4 NOT NULL,
    statut_id           INT4 REFERENCES statut_paiement(id),
    canal_id            INT4 REFERENCES canal_paiement(id),
    reference_paystack  VARCHAR(255),
    reference_externe   VARCHAR(255),
    -- Chemin relatif MinIO : bucket résolu depuis app_config (MINIO_BUCKET_MEDIA)
    preuve_file_path    VARCHAR(500),               -- ex: 'preuves/cite_id/villa_id/uuid.jpg'
    note                TEXT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP,
    deleted_at          TIMESTAMP,
    is_deleted          BOOLEAN DEFAULT FALSE,
    created_by          UUID,
    updated_by          UUID,
    deleted_by          UUID,
    UNIQUE (cite_id, villa_id, mois)
);

-- Reçu PDF lié à la villa
-- Le bucket est résolu depuis app_config (MINIO_BUCKET_DOCUMENTS) côté service
CREATE TABLE IF NOT EXISTS recu_paiement (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paiement_id     UUID NOT NULL UNIQUE REFERENCES paiement(id),
    cite_id         UUID NOT NULL REFERENCES cite(id),
    villa_id        UUID NOT NULL REFERENCES villa(id),
    file_path       VARCHAR(500) NOT NULL,           -- ex: 'recus/cite_id/2026-09/uuid.pdf'
    qr_code_token   VARCHAR(255) UNIQUE,
    generated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP,
    deleted_at      TIMESTAMP,
    is_deleted      BOOLEAN DEFAULT FALSE,
    created_by      UUID,
    updated_by      UUID,
    deleted_by      UUID
);

-- ============================================================
-- 4. ALERTES SÉCURITÉ
-- ============================================================

CREATE TABLE IF NOT EXISTS alerte_securite (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cite_id         UUID NOT NULL REFERENCES cite(id),
    habitant_id     UUID NOT NULL REFERENCES "user"(id),
    villa_id        UUID REFERENCES villa(id),
    motif_id        INT4 REFERENCES motif_alerte(id),
    description          TEXT,
    -- Chemin relatif MinIO : bucket résolu depuis app_config (MINIO_BUCKET_MEDIA)
    photo_file_path      VARCHAR(500),               -- ex: 'alertes/cite_id/uuid.jpg'
    silencieuse          BOOLEAN DEFAULT FALSE,
    statut_id       INT4 REFERENCES statut_alerte(id),
    escalade        BOOLEAN DEFAULT FALSE,
    escalade_at     TIMESTAMP,
    resolu_par      UUID REFERENCES "user"(id),
    resolu_at       TIMESTAMP,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP,
    deleted_at      TIMESTAMP,
    is_deleted      BOOLEAN DEFAULT FALSE,
    created_by      UUID,
    updated_by      UUID,
    deleted_by      UUID
);

-- ============================================================
-- 5. INCIDENTS & COMMENTAIRES (2 niveaux max)
-- ============================================================

CREATE TABLE IF NOT EXISTS statut_incident (
    id          INT4 PRIMARY KEY,
    libelle     VARCHAR(255),
    code        VARCHAR(100) UNIQUE,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP,
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_by  INT4,
    updated_by  INT4,
    deleted_by  INT4
);

INSERT INTO statut_incident (id, libelle, code, is_deleted, created_by)
VALUES
    (20, 'Signalé',  'SIGNALE',  FALSE, 0),
    (21, 'En cours', 'EN_COURS', FALSE, 0),
    (22, 'Résolu',   'RESOLU',   FALSE, 0)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS incident (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cite_id         UUID NOT NULL REFERENCES cite(id),
    auteur_id       UUID NOT NULL REFERENCES "user"(id),
    villa_id        UUID REFERENCES villa(id),
    categorie_id    INT4 REFERENCES categorie_incident(id),
    titre           VARCHAR(255),
    description          TEXT NOT NULL,
    -- Chemin relatif MinIO : bucket résolu depuis app_config (MINIO_BUCKET_MEDIA)
    photo_file_path      VARCHAR(500),               -- ex: 'incidents/cite_id/uuid.jpg'
    statut_id            INT4 REFERENCES statut_incident(id),
    note_syndic          TEXT,
    pris_en_charge_par   UUID REFERENCES "user"(id),
    pris_en_charge_at    TIMESTAMP,
    resolu_par           UUID REFERENCES "user"(id),
    resolu_at            TIMESTAMP,
    created_at           TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at           TIMESTAMP,
    deleted_at           TIMESTAMP,
    is_deleted           BOOLEAN DEFAULT FALSE,
    created_by           UUID,
    updated_by           UUID,
    deleted_by           UUID
);

CREATE TABLE IF NOT EXISTS incident_like (
    incident_id UUID REFERENCES incident(id),
    user_id     UUID REFERENCES "user"(id),
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (incident_id, user_id)
);

CREATE TABLE IF NOT EXISTS incident_commentaire (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    incident_id UUID NOT NULL REFERENCES incident(id),
    auteur_id   UUID NOT NULL REFERENCES "user"(id),
    parent_id   UUID REFERENCES incident_commentaire(id),
    niveau      INT2 NOT NULL DEFAULT 1 CHECK (niveau IN (1, 2)),
    texte       TEXT NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP,
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_by  UUID,
    updated_by  UUID,
    deleted_by  UUID
);

-- ============================================================
-- 5bis. FEED SOCIAL (posts médias + likes + commentaires 2 niveaux)
-- Le type du post (texte / photo / vidéo) se déduit des lignes feed_post_media.
-- ============================================================

CREATE TABLE IF NOT EXISTS feed_post (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cite_id            UUID NOT NULL REFERENCES cite(id),
    auteur_id          UUID NOT NULL REFERENCES "user"(id),
    contenu            TEXT,
    likes_count        INT4 NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
    commentaires_count INT4 NOT NULL DEFAULT 0 CHECK (commentaires_count >= 0),
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP,
    deleted_at         TIMESTAMP,
    is_deleted         BOOLEAN DEFAULT FALSE,
    created_by         UUID,
    updated_by         UUID,
    deleted_by         UUID,
    CHECK (contenu IS NULL OR length(contenu) <= 5000)
);

CREATE INDEX IF NOT EXISTS idx_feed_post_feed
    ON feed_post (cite_id, created_at DESC, id DESC)
    WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_feed_post_auteur_id ON feed_post (auteur_id);
CREATE INDEX IF NOT EXISTS idx_feed_post_is_deleted ON feed_post (is_deleted);

CREATE TABLE IF NOT EXISTS feed_post_media (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id     UUID NOT NULL REFERENCES feed_post(id),
    cite_id     UUID NOT NULL REFERENCES cite(id),
    type        VARCHAR(20) NOT NULL CHECK (type IN ('IMAGE', 'VIDEO')),
    file_path   VARCHAR(500) NOT NULL,
    mime_type   VARCHAR(100) NOT NULL,
    taille_ko   INT4,
    ordre       INT2 NOT NULL DEFAULT 1,
    largeur     INT4,
    hauteur     INT4,
    duree_sec   INT4,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP,
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_by  UUID,
    updated_by  UUID,
    deleted_by  UUID,
    UNIQUE (post_id, ordre)
);

CREATE INDEX IF NOT EXISTS idx_feed_media_post_id ON feed_post_media (post_id, ordre);
CREATE INDEX IF NOT EXISTS idx_feed_media_cite_id ON feed_post_media (cite_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_feed_media_one_video
    ON feed_post_media (post_id)
    WHERE type = 'VIDEO';

CREATE TABLE IF NOT EXISTS feed_post_like (
    post_id    UUID REFERENCES feed_post(id),
    user_id    UUID REFERENCES "user"(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_feed_like_user_id ON feed_post_like (user_id);

CREATE TABLE IF NOT EXISTS feed_post_commentaire (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id     UUID NOT NULL REFERENCES feed_post(id),
    auteur_id   UUID NOT NULL REFERENCES "user"(id),
    parent_id   UUID REFERENCES feed_post_commentaire(id),
    niveau      INT2 NOT NULL DEFAULT 1 CHECK (niveau IN (1, 2)),
    texte       TEXT NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP,
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_by  UUID,
    updated_by  UUID,
    deleted_by  UUID
);

CREATE INDEX IF NOT EXISTS idx_feed_comment_post_id
    ON feed_post_commentaire (post_id, is_deleted, created_at);
CREATE INDEX IF NOT EXISTS idx_feed_comment_niveau ON feed_post_commentaire (niveau);
CREATE INDEX IF NOT EXISTS idx_feed_comment_parent_id ON feed_post_commentaire (parent_id);
CREATE INDEX IF NOT EXISTS idx_feed_comment_auteur_id ON feed_post_commentaire (auteur_id);

-- ============================================================
-- 6. MESSAGERIE (PG métadonnées, MongoDB contenu)
-- ============================================================

CREATE TABLE IF NOT EXISTS groupe_cite (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cite_id     UUID NOT NULL UNIQUE REFERENCES cite(id),
    nom         VARCHAR(255) NOT NULL,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP,
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_by  UUID,
    updated_by  UUID,
    deleted_by  UUID
);

CREATE TABLE IF NOT EXISTS groupe_cite_membre (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    groupe_id   UUID NOT NULL REFERENCES groupe_cite(id),
    user_id     UUID NOT NULL REFERENCES "user"(id),
    cite_id     UUID NOT NULL REFERENCES cite(id),
    joined_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at     TIMESTAMP,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP,
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_by  UUID,
    updated_by  UUID,
    deleted_by  UUID,
    UNIQUE (groupe_id, user_id)
);

CREATE TABLE IF NOT EXISTS message (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cite_id         UUID NOT NULL REFERENCES cite(id),
    groupe_id       UUID REFERENCES groupe_cite(id),
    expediteur_id   UUID NOT NULL REFERENCES "user"(id),
    destinataire_id UUID REFERENCES "user"(id),
    mongo_doc_id    VARCHAR(255),
    est_groupe      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP,
    deleted_at      TIMESTAMP,
    is_deleted      BOOLEAN DEFAULT FALSE,
    created_by      UUID,
    updated_by      UUID,
    deleted_by      UUID,
    CONSTRAINT chk_message_type CHECK (
        (est_groupe = TRUE  AND groupe_id IS NOT NULL AND destinataire_id IS NULL)
        OR
        (est_groupe = FALSE AND groupe_id IS NULL     AND destinataire_id IS NOT NULL)
    )
);

-- ============================================================
-- 7. ANNONCES, CONFLITS
-- ============================================================

CREATE TABLE IF NOT EXISTS annonce (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cite_id         UUID NOT NULL REFERENCES cite(id),
    auteur_id       UUID NOT NULL REFERENCES "user"(id),
    categorie_id    INT4 REFERENCES categorie_annonce(id),
    titre           VARCHAR(255) NOT NULL,
    contenu         TEXT NOT NULL,
    est_epinglee    BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP,
    deleted_at      TIMESTAMP,
    is_deleted      BOOLEAN DEFAULT FALSE,
    created_by      UUID,
    updated_by      UUID,
    deleted_by      UUID
);

CREATE TABLE IF NOT EXISTS conflit (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cite_id             UUID NOT NULL REFERENCES cite(id),
    declarant_id        UUID NOT NULL REFERENCES "user"(id),
    villa_declarant_id  UUID REFERENCES villa(id),
    categorie_id        INT4 REFERENCES categorie_conflit(id),
    villa_ciblee_id     UUID REFERENCES villa(id),
    villa_ciblee_num    VARCHAR(50) NOT NULL,
    description         TEXT NOT NULL,
    statut_id           INT4 REFERENCES statut_conflit(id),
    note_syndic         TEXT,
    resolution_note     TEXT,
    pris_en_charge_par  UUID REFERENCES "user"(id),
    pris_en_charge_at   TIMESTAMP,
    resolu_at           TIMESTAMP,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP,
    deleted_at          TIMESTAMP,
    is_deleted          BOOLEAN DEFAULT FALSE,
    created_by          UUID,
    updated_by          UUID,
    deleted_by          UUID
);

-- ============================================================
-- 8. DOCUMENTS (MinIO)
-- ============================================================

-- Document — chemin relatif MinIO (bucket résolu depuis app_config)
CREATE TABLE IF NOT EXISTS document (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cite_id         UUID NOT NULL REFERENCES cite(id),
    auteur_id       UUID NOT NULL REFERENCES "user"(id),
    titre           VARCHAR(255) NOT NULL,
    -- Chemin relatif MinIO : bucket résolu depuis app_config (MINIO_BUCKET_DOCUMENTS)
    file_path       VARCHAR(500) NOT NULL,           -- ex: 'documents/cite_id/uuid.pdf'
    type_id         INT4 REFERENCES type_document(id),
    taille_ko       INT4,
    created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP,
    deleted_at      TIMESTAMP,
    is_deleted      BOOLEAN DEFAULT FALSE,
    created_by      UUID,
    updated_by      UUID,
    deleted_by      UUID
);

-- ============================================================
-- 9. NOTIFICATIONS IN-APP
-- ============================================================

CREATE TABLE IF NOT EXISTS notification (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cite_id     UUID NOT NULL REFERENCES cite(id),
    user_id     UUID NOT NULL REFERENCES "user"(id),
    type_id     INT4 REFERENCES type_notification(id),
    titre       VARCHAR(255) NOT NULL,
    message     TEXT,
    lu          BOOLEAN DEFAULT FALSE,
    lu_at       TIMESTAMP,
    data        JSONB,
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP,
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_by  UUID,
    updated_by  UUID,
    deleted_by  UUID
);

-- ============================================================
-- 10. WEBHOOK GÉNÉRIQUE
-- ============================================================

-- L'agrégateur actif est lu depuis app_config (clé WEBHOOK_AGGREGATEUR_ACTIF).
-- Le champ aggregateur_code ici est une copie dénormalisée au moment de la réception
-- pour garder la traçabilité même si la config change ensuite.
-- Valeurs attendues : 'PAYSTACK', 'WAVE', 'MTN', etc.
CREATE TABLE IF NOT EXISTS webhook (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregateur_code    VARCHAR(100) NOT NULL,       -- copie de WEBHOOK_AGGREGATEUR_ACTIF au moment de la réception
    event               VARCHAR(100),
    reference           VARCHAR(255) NOT NULL,
    signature_ok        BOOLEAN DEFAULT FALSE,
    payload_requete     TEXT,                        -- corps brut reçu (JSON stringifié)
    payload_reponse     TEXT,                        -- réponse renvoyée au webhook
    montant_attendu     INT4,
    montant_recu        INT4,
    -- Calculé par PostgreSQL : TRUE si égaux, FALSE si différents, NULL si incomparable
    montant_match       BOOLEAN GENERATED ALWAYS AS
                        (montant_recu = montant_attendu) STORED,
    traite              BOOLEAN DEFAULT FALSE,
    traite_at           TIMESTAMP,
    erreur              TEXT,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP,
    deleted_at          TIMESTAMP,
    is_deleted          BOOLEAN DEFAULT FALSE,
    created_by          UUID,
    updated_by          UUID,
    deleted_by          UUID,
    UNIQUE (aggregateur_code, reference)             -- idempotence par agrégateur
);

-- ============================================================
-- 11. AUDIT LOG (insert-only)
-- ============================================================

CREATE TABLE IF NOT EXISTS audit_log (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cite_id           UUID REFERENCES cite(id),
    user_id           UUID REFERENCES "user"(id),
    profil_actif_code VARCHAR(100),                 -- [v3] quel profil était actif lors de l'action
    action            VARCHAR(100) NOT NULL,
    entite            VARCHAR(100) NOT NULL,
    entite_id         VARCHAR(255),
    anciennes_valeurs JSONB,
    nouvelles_valeurs JSONB,
    ip_address        VARCHAR(45),
    user_agent        VARCHAR(500),
    created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 12. OTP (Gmail SMTP — simple, sans table type)
-- ============================================================

CREATE TABLE IF NOT EXISTS otp (
    id              SERIAL4 PRIMARY KEY,
    code            VARCHAR(10) NOT NULL,
    user_id         VARCHAR(255) NOT NULL,           -- UUID ou email (avant création du user)
    contexte        VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
    -- Valeurs : 'REGISTER' | 'FORGOT_PASSWORD' | 'CHANGE_EMAIL' | 'GENERAL'
    -- TTL géré via expires_at (durée depuis app_config OTP_EXPIRY_MINUTES)
    email_dest      VARCHAR(255),                    -- destinataire (Gmail SMTP)
    is_used         BOOLEAN NOT NULL DEFAULT FALSE,
    attempts_count  INT NOT NULL DEFAULT 0,
    expires_at      TIMESTAMP NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP,
    deleted_at      TIMESTAMP,
    is_deleted      BOOLEAN NOT NULL DEFAULT FALSE,
    created_by      INT,
    updated_by      INT,
    deleted_by      INT
);

-- ============================================================
-- 13. APP CONFIG
-- ============================================================

CREATE TABLE IF NOT EXISTS app_config (
    id          SERIAL PRIMARY KEY,
    "key"       VARCHAR(100) NOT NULL UNIQUE,
    value       VARCHAR(500),                        -- élargi à 500 pour les configs longues
    module      VARCHAR(100),
    description TEXT,
    created_at  TIMESTAMP,
    updated_at  TIMESTAMP,
    deleted_at  TIMESTAMP,
    is_deleted  BOOLEAN DEFAULT FALSE,
    created_by  INT,
    updated_by  INT,
    deleted_by  INT
);

-- ============================================================
-- CONTRAINTES IDEMPOTENTES
-- ============================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_otp_expiration') THEN
        ALTER TABLE otp ADD CONSTRAINT chk_otp_expiration
            CHECK (expires_at > created_at);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_otp_code_length') THEN
        ALTER TABLE otp ADD CONSTRAINT chk_otp_code_length
            CHECK (LENGTH(code) >= 4 AND LENGTH(code) <= 10);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_otp_attempts') THEN
        ALTER TABLE otp ADD CONSTRAINT chk_otp_attempts
            CHECK (attempts_count >= 0 AND attempts_count <= 3);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_paiement_mois_format') THEN
        ALTER TABLE paiement ADD CONSTRAINT chk_paiement_mois_format
            CHECK (mois ~ '^\d{4}-(0[1-9]|1[0-2])$');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_paiement_montant_positif') THEN
        ALTER TABLE paiement ADD CONSTRAINT chk_paiement_montant_positif
            CHECK (montant > 0);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_commentaire_niveau') THEN
        ALTER TABLE incident_commentaire ADD CONSTRAINT chk_commentaire_niveau
            CHECK (
                (niveau = 1 AND parent_id IS NULL)
                OR
                (niveau = 2 AND parent_id IS NOT NULL)
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_user_profil_priority') THEN
        ALTER TABLE user_profil ADD CONSTRAINT chk_user_profil_priority
            CHECK (order_priority >= 1 AND order_priority <= 10);
    END IF;
    -- Index partiel : une seule villa courante par user ET par cité (is_current)
    -- (permet d'être occupant courant dans plusieurs cités en même temps)
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_villa_unique_current') THEN
        CREATE UNIQUE INDEX idx_user_villa_unique_current
            ON user_villa (user_id, cite_id)
            WHERE is_current = TRUE AND is_deleted = FALSE;
    END IF;
    -- Index partiel : priority 1 unique par user (profil par défaut)
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_user_profil_default') THEN
        CREATE UNIQUE INDEX idx_user_profil_default
            ON user_profil (user_id)
            WHERE order_priority = 1 AND is_active = TRUE AND is_deleted = FALSE;
    END IF;
END $$;

-- ============================================================
-- INDEX IDEMPOTENTS
-- ============================================================

-- user
CREATE INDEX IF NOT EXISTS idx_user_cite_id          ON "user" (cite_id);
CREATE INDEX IF NOT EXISTS idx_user_email            ON "user" (email);
CREATE INDEX IF NOT EXISTS idx_user_is_active        ON "user" (is_active);

-- user_profil [v3]
CREATE INDEX IF NOT EXISTS idx_up_user_id            ON user_profil (user_id);
CREATE INDEX IF NOT EXISTS idx_up_profil_id          ON user_profil (profil_id);
CREATE INDEX IF NOT EXISTS idx_up_cite_id            ON user_profil (cite_id);
CREATE INDEX IF NOT EXISTS idx_up_is_active          ON user_profil (is_active);

-- villa
CREATE INDEX IF NOT EXISTS idx_villa_cite_id         ON villa (cite_id);
CREATE INDEX IF NOT EXISTS idx_villa_numero          ON villa (numero);

-- user_villa
CREATE INDEX IF NOT EXISTS idx_user_villa_user_id    ON user_villa (user_id);
CREATE INDEX IF NOT EXISTS idx_user_villa_villa_id   ON user_villa (villa_id);
CREATE INDEX IF NOT EXISTS idx_user_villa_cite_id    ON user_villa (cite_id);
CREATE INDEX IF NOT EXISTS idx_user_villa_current    ON user_villa (is_current);

-- profil_feature [v3] — versionnée
CREATE INDEX IF NOT EXISTS idx_pf_profil_id          ON profil_feature (profil_id);
CREATE INDEX IF NOT EXISTS idx_pf_feature_id         ON profil_feature (feature_id);
CREATE INDEX IF NOT EXISTS idx_pf_version_tag        ON profil_feature (version_tag);
CREATE INDEX IF NOT EXISTS idx_pf_valid_from         ON profil_feature (valid_from);
CREATE INDEX IF NOT EXISTS idx_pfv_profil_id         ON profil_feature_version (profil_id);
CREATE INDEX IF NOT EXISTS idx_pfv_version_tag       ON profil_feature_version (version_tag);

-- paiement
CREATE INDEX IF NOT EXISTS idx_paiement_cite_id      ON paiement (cite_id);
CREATE INDEX IF NOT EXISTS idx_paiement_villa_id     ON paiement (villa_id);
CREATE INDEX IF NOT EXISTS idx_paiement_mois         ON paiement (mois);
CREATE INDEX IF NOT EXISTS idx_paiement_statut_id    ON paiement (statut_id);
CREATE INDEX IF NOT EXISTS idx_paiement_canal_id     ON paiement (canal_id);
CREATE INDEX IF NOT EXISTS idx_paiement_is_deleted   ON paiement (is_deleted);

-- alerte
CREATE INDEX IF NOT EXISTS idx_alerte_cite_id        ON alerte_securite (cite_id);
CREATE INDEX IF NOT EXISTS idx_alerte_statut_id      ON alerte_securite (statut_id);
CREATE INDEX IF NOT EXISTS idx_alerte_escalade       ON alerte_securite (escalade);
CREATE INDEX IF NOT EXISTS idx_alerte_created_at     ON alerte_securite (created_at);
CREATE INDEX IF NOT EXISTS idx_alerte_is_deleted     ON alerte_securite (is_deleted);

-- incident
CREATE INDEX IF NOT EXISTS idx_incident_cite_id      ON incident (cite_id);
CREATE INDEX IF NOT EXISTS idx_incident_auteur_id    ON incident (auteur_id);
CREATE INDEX IF NOT EXISTS idx_incident_is_deleted   ON incident (is_deleted);

-- incident_commentaire
CREATE INDEX IF NOT EXISTS idx_comment_incident_id   ON incident_commentaire (incident_id);
CREATE INDEX IF NOT EXISTS idx_comment_parent_id     ON incident_commentaire (parent_id);
CREATE INDEX IF NOT EXISTS idx_comment_niveau        ON incident_commentaire (niveau);

-- message
CREATE INDEX IF NOT EXISTS idx_message_cite_id       ON message (cite_id);
CREATE INDEX IF NOT EXISTS idx_message_groupe_id     ON message (groupe_id);
CREATE INDEX IF NOT EXISTS idx_message_expediteur    ON message (expediteur_id);
CREATE INDEX IF NOT EXISTS idx_message_destinataire  ON message (destinataire_id);
CREATE INDEX IF NOT EXISTS idx_message_est_groupe    ON message (est_groupe);
CREATE INDEX IF NOT EXISTS idx_message_created_at    ON message (created_at);

-- groupe_cite_membre
CREATE INDEX IF NOT EXISTS idx_gcm_groupe_id         ON groupe_cite_membre (groupe_id);
CREATE INDEX IF NOT EXISTS idx_gcm_user_id           ON groupe_cite_membre (user_id);
CREATE INDEX IF NOT EXISTS idx_gcm_cite_id           ON groupe_cite_membre (cite_id);

-- conflit
CREATE INDEX IF NOT EXISTS idx_conflit_cite_id       ON conflit (cite_id);
CREATE INDEX IF NOT EXISTS idx_conflit_declarant     ON conflit (declarant_id);
CREATE INDEX IF NOT EXISTS idx_conflit_statut_id     ON conflit (statut_id);

-- annonce
CREATE INDEX IF NOT EXISTS idx_annonce_cite_id       ON annonce (cite_id);
CREATE INDEX IF NOT EXISTS idx_annonce_epinglee      ON annonce (est_epinglee);

-- document
CREATE INDEX IF NOT EXISTS idx_document_cite_id      ON document (cite_id);

-- notification
CREATE INDEX IF NOT EXISTS idx_notif_user_id         ON notification (user_id);
CREATE INDEX IF NOT EXISTS idx_notif_cite_id         ON notification (cite_id);
CREATE INDEX IF NOT EXISTS idx_notif_lu              ON notification (lu);

-- webhook
CREATE INDEX IF NOT EXISTS idx_webhook_aggregateur   ON webhook (aggregateur_code);
CREATE INDEX IF NOT EXISTS idx_webhook_reference     ON webhook (reference);
CREATE INDEX IF NOT EXISTS idx_webhook_traite        ON webhook (traite);

-- audit_log
CREATE INDEX IF NOT EXISTS idx_audit_cite_id         ON audit_log (cite_id);
CREATE INDEX IF NOT EXISTS idx_audit_user_id         ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_profil_actif    ON audit_log (profil_actif_code);
CREATE INDEX IF NOT EXISTS idx_audit_entite          ON audit_log (entite);
CREATE INDEX IF NOT EXISTS idx_audit_created_at      ON audit_log (created_at);

-- otp
CREATE INDEX IF NOT EXISTS idx_otp_user_id           ON otp (user_id);
CREATE INDEX IF NOT EXISTS idx_otp_contexte          ON otp (contexte);
CREATE INDEX IF NOT EXISTS idx_otp_expires_at        ON otp (expires_at);

-- recu_paiement [v3 MinIO]
CREATE INDEX IF NOT EXISTS idx_recu_paiement_id      ON recu_paiement (paiement_id);
CREATE INDEX IF NOT EXISTS idx_recu_qr_token         ON recu_paiement (qr_code_token);

-- ============================================================
-- PROCÉDURES UTILITAIRES
-- ============================================================

CREATE OR REPLACE PROCEDURE cleanup_expired_otps()
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE otp
    SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP
    WHERE (expires_at < CURRENT_TIMESTAMP OR is_used = TRUE)
      AND is_deleted = FALSE
      AND created_at < CURRENT_TIMESTAMP - INTERVAL '1 day';
END;
$$;

CREATE OR REPLACE PROCEDURE escalade_alertes_non_traitees()
LANGUAGE plpgsql AS $$
BEGIN
    UPDATE alerte_securite
    SET
        escalade    = TRUE,
        escalade_at = CURRENT_TIMESTAMP,
        updated_at  = CURRENT_TIMESTAMP
    WHERE
        statut_id   = 10
        AND escalade = FALSE
        AND is_deleted = FALSE
        AND created_at < CURRENT_TIMESTAMP - INTERVAL '3 minutes';
END;
$$;

-- Ajoute un user au groupe de sa cité (appelée après INSERT user)
CREATE OR REPLACE PROCEDURE add_user_to_cite_groupe(p_user_id UUID, p_cite_id UUID)
LANGUAGE plpgsql AS $$
DECLARE
    v_groupe_id UUID;
BEGIN
    SELECT id INTO v_groupe_id
    FROM groupe_cite
    WHERE cite_id = p_cite_id AND is_deleted = FALSE;

    IF v_groupe_id IS NOT NULL THEN
        INSERT INTO groupe_cite_membre (groupe_id, user_id, cite_id)
        VALUES (v_groupe_id, p_user_id, p_cite_id)
        ON CONFLICT (groupe_id, user_id) DO NOTHING;
    END IF;
END;
$$;

-- ── [NOUVEAU v3] Snapshot du jeu de features actif d'un profil ─
-- Appelée à chaque INSERT/UPDATE/DELETE dans profil_feature.
-- Crée un nouveau snapshot si la version_tag change.
CREATE OR REPLACE PROCEDURE snapshot_profil_features(
    p_profil_id  INT4,
    p_version_tag VARCHAR(50),
    p_note       TEXT DEFAULT NULL
)
LANGUAGE plpgsql AS $$
DECLARE
    v_snapshot JSONB;
BEGIN
    SELECT jsonb_agg(f.code ORDER BY f.code)
    INTO v_snapshot
    FROM profil_feature pf
    JOIN feature f ON f.id = pf.feature_id
    WHERE pf.profil_id  = p_profil_id
      AND pf.is_deleted = FALSE
      AND pf.valid_from <= CURRENT_TIMESTAMP
      AND (pf.valid_until IS NULL OR pf.valid_until > CURRENT_TIMESTAMP);

    INSERT INTO profil_feature_version (profil_id, version_tag, features_snapshot, note, created_at)
    VALUES (p_profil_id, p_version_tag, COALESCE(v_snapshot, '[]'::jsonb), p_note, CURRENT_TIMESTAMP)
    ON CONFLICT (profil_id, version_tag) DO UPDATE
        SET features_snapshot = EXCLUDED.features_snapshot,
            note              = EXCLUDED.note;
END;
$$;

/*
-- pg_cron si disponible :
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('otp_cleanup',     '0 0 * * *', $$CALL cleanup_expired_otps();$$);
SELECT cron.schedule('alerte_escalade', '* * * * *', $$CALL escalade_alertes_non_traitees();$$);
*/

-- ============================================================
-- SEED — DONNÉES DE RÉFÉRENCE
-- ON CONFLICT DO NOTHING — réexécutable sans erreur
-- ============================================================

-- ── Profils ──────────────────────────────────────────────────
INSERT INTO profil (id, libelle, code, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    (1, 'Super Administrateur', 'SUPER_ADMIN',  '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (2, 'Administrateur',       'ADMIN',        '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (3, 'Syndic',               'SYNDIC',       '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (4, 'Chef de Sécurité',     'CHEF_SECURITE','2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (5, 'Habitant',             'HABITANT',     '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Features RBAC ────────────────────────────────────────────
INSERT INTO feature (libelle, code, module, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    ('Se connecter',                       'AUTH_LOGIN',                  'AUTH',        '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Changer mot de passe',               'AUTH_CHANGE_PASSWORD',        'AUTH',        '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Changer de profil actif',            'AUTH_SWITCH_PROFIL',          'AUTH',        '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Voir ses paiements',                 'PAIEMENT_READ_OWN',           'PAIEMENT',    '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Payer via Paystack',                 'PAIEMENT_PAYSTACK',           'PAIEMENT',    '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Télécharger reçu PDF',              'PAIEMENT_DOWNLOAD_RECU',      'PAIEMENT',    '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Voir tous les paiements',            'PAIEMENT_READ_ALL',           'PAIEMENT',    '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Enregistrer paiement manuel',        'PAIEMENT_SAISIE_MANUELLE',    'PAIEMENT',    '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Exporter paiements Excel',           'PAIEMENT_EXPORT_EXCEL',       'PAIEMENT',    '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Envoyer alerte sécurité',           'ALERTE_CREATE',               'SECURITE',    '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Voir alertes actives',               'ALERTE_READ_ACTIVE',          'SECURITE',    '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Changer statut alerte',              'ALERTE_UPDATE_STATUT',        'SECURITE',    '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Voir historique alertes',            'ALERTE_READ_HISTORY',         'SECURITE',    '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Signaler un incident',               'INCIDENT_CREATE',             'INCIDENT',    '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Voir les incidents',                 'INCIDENT_READ',               'INCIDENT',    '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Liker un incident',                  'INCIDENT_LIKE',               'INCIDENT',    '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Commenter un incident',              'INCIDENT_COMMENT',            'INCIDENT',    '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Traiter un incident',                'INCIDENT_MANAGE',             'INCIDENT',    '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Déclarer un conflit',               'CONFLIT_CREATE',              'CONFLIT',     '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Voir ses conflits',                  'CONFLIT_READ_OWN',            'CONFLIT',     '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Voir tous les conflits',             'CONFLIT_READ_ALL',            'CONFLIT',     '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Gérer un conflit',                  'CONFLIT_MANAGE',              'CONFLIT',     '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Voir les annonces',                  'ANNONCE_READ',                'ANNONCE',     '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Créer une annonce',                 'ANNONCE_CREATE',              'ANNONCE',     '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Modifier une annonce',              'ANNONCE_UPDATE',              'ANNONCE',     '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Supprimer une annonce',             'ANNONCE_DELETE',              'ANNONCE',     '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Envoyer message privé',            'MESSAGE_SEND_PRIVATE',        'MESSAGE',     '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Envoyer message groupe',           'MESSAGE_SEND_GROUPE',         'MESSAGE',     '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Supprimer son message',            'MESSAGE_DELETE_OWN',          'MESSAGE',     '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Voir les documents',                 'DOCUMENT_READ',               'DOCUMENT',    '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Uploader un document',               'DOCUMENT_UPLOAD',             'DOCUMENT',    '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Supprimer un document',             'DOCUMENT_DELETE',             'DOCUMENT',    '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Voir liste habitants',               'HABITANT_READ',               'HABITANT',    '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Modifier villa habitant',            'HABITANT_UPDATE_VILLA',       'HABITANT',    '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Créer compte staff',                'ADMIN_CREATE_STAFF',          'ADMIN',       '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Désactiver un compte',             'ADMIN_DEACTIVATE_USER',       'ADMIN',       '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Configurer la cité',               'ADMIN_CONFIG_CITE',           'ADMIN',       '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Gérer les features d''un profil', 'ADMIN_MANAGE_FEATURES',       'ADMIN',       '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Créer une cité',                   'SA_CREATE_CITE',              'SUPER_ADMIN', '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Voir toutes les cités',             'SA_READ_ALL_CITES',           'SUPER_ADMIN', '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Créer compte administrateur',       'SA_CREATE_ADMIN',             'SUPER_ADMIN', '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Assigner des profils à un user',    'SA_ASSIGN_PROFIL',            'SUPER_ADMIN', '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Gérer candidatures d''occupation',  'VILLA_GERER_CANDIDATURES',    'VILLA',       '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Voir le feed',                      'FEED_READ',                   'FEED',        '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Publier dans le feed',              'FEED_CREATE',                 'FEED',        '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Supprimer ses posts',               'FEED_DELETE_OWN',             'FEED',        '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Modérer le feed',                   'FEED_MODERATE',               'FEED',        '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Liker un post',                     'FEED_LIKE',                   'FEED',        '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('Commenter un post',                 'FEED_COMMENT',                'FEED',        '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL)
ON CONFLICT (code) DO NOTHING;

-- ── profil_feature versionnée — v1.0 ────────────────────────

-- SUPER_ADMIN (1) = toutes les features, version v1.0
INSERT INTO profil_feature (profil_id, feature_id, version_tag, valid_from, created_at, is_deleted, created_by)
SELECT 1, id, 'v1.0', '2026-09-01 00:00:00', '2026-09-01 00:00:00', false, 0
FROM feature WHERE is_deleted = FALSE
ON CONFLICT (profil_id, feature_id, version_tag) DO NOTHING;

-- ADMIN (2) v1.0
INSERT INTO profil_feature (profil_id, feature_id, version_tag, valid_from, created_at, is_deleted, created_by)
SELECT 2, id, 'v1.0', '2026-09-01 00:00:00', '2026-09-01 00:00:00', false, 0
FROM feature WHERE code IN (
    'AUTH_LOGIN','AUTH_CHANGE_PASSWORD','AUTH_SWITCH_PROFIL',
    'PAIEMENT_READ_ALL','PAIEMENT_EXPORT_EXCEL',
    'ALERTE_READ_ACTIVE','ALERTE_READ_HISTORY',
    'INCIDENT_READ','INCIDENT_MANAGE','CONFLIT_READ_ALL','ANNONCE_READ',
    'DOCUMENT_READ',
    'HABITANT_READ','HABITANT_UPDATE_VILLA',
    'VILLA_GERER_CANDIDATURES',
    'ADMIN_CREATE_STAFF','ADMIN_DEACTIVATE_USER',
    'ADMIN_CONFIG_CITE','ADMIN_MANAGE_FEATURES',
    'FEED_READ','FEED_CREATE','FEED_DELETE_OWN','FEED_MODERATE','FEED_LIKE','FEED_COMMENT'
) AND is_deleted = FALSE
ON CONFLICT (profil_id, feature_id, version_tag) DO NOTHING;

-- SYNDIC (3) v1.0
INSERT INTO profil_feature (profil_id, feature_id, version_tag, valid_from, created_at, is_deleted, created_by)
SELECT 3, id, 'v1.0', '2026-09-01 00:00:00', '2026-09-01 00:00:00', false, 0
FROM feature WHERE code IN (
    'AUTH_LOGIN','AUTH_CHANGE_PASSWORD','AUTH_SWITCH_PROFIL',
    'PAIEMENT_READ_ALL','PAIEMENT_SAISIE_MANUELLE',
    'PAIEMENT_EXPORT_EXCEL','PAIEMENT_DOWNLOAD_RECU',
    'ALERTE_READ_ACTIVE','ALERTE_READ_HISTORY',
    'INCIDENT_READ','INCIDENT_COMMENT','INCIDENT_MANAGE',
    'CONFLIT_READ_ALL','CONFLIT_MANAGE',
    'ANNONCE_READ','ANNONCE_CREATE','ANNONCE_UPDATE','ANNONCE_DELETE',
    'MESSAGE_SEND_PRIVATE','MESSAGE_SEND_GROUPE','MESSAGE_DELETE_OWN',
    'DOCUMENT_READ','DOCUMENT_UPLOAD','DOCUMENT_DELETE',
    'HABITANT_READ','HABITANT_UPDATE_VILLA','VILLA_GERER_CANDIDATURES',
    'FEED_READ','FEED_CREATE','FEED_DELETE_OWN','FEED_MODERATE','FEED_LIKE','FEED_COMMENT'
) AND is_deleted = FALSE
ON CONFLICT (profil_id, feature_id, version_tag) DO NOTHING;

-- CHEF_SECURITE (4) v1.0
INSERT INTO profil_feature (profil_id, feature_id, version_tag, valid_from, created_at, is_deleted, created_by)
SELECT 4, id, 'v1.0', '2026-09-01 00:00:00', '2026-09-01 00:00:00', false, 0
FROM feature WHERE code IN (
    'AUTH_LOGIN','AUTH_CHANGE_PASSWORD','AUTH_SWITCH_PROFIL',
    'ALERTE_READ_ACTIVE','ALERTE_UPDATE_STATUT','ALERTE_READ_HISTORY',
    'ANNONCE_READ','MESSAGE_SEND_GROUPE',
    'FEED_READ','FEED_CREATE','FEED_DELETE_OWN','FEED_LIKE','FEED_COMMENT'
) AND is_deleted = FALSE
ON CONFLICT (profil_id, feature_id, version_tag) DO NOTHING;

-- HABITANT (5) v1.0
INSERT INTO profil_feature (profil_id, feature_id, version_tag, valid_from, created_at, is_deleted, created_by)
SELECT 5, id, 'v1.0', '2026-09-01 00:00:00', '2026-09-01 00:00:00', false, 0
FROM feature WHERE code IN (
    'AUTH_LOGIN','AUTH_CHANGE_PASSWORD','AUTH_SWITCH_PROFIL',
    'PAIEMENT_READ_OWN','PAIEMENT_PAYSTACK','PAIEMENT_DOWNLOAD_RECU',
    'ALERTE_CREATE',
    'INCIDENT_CREATE','INCIDENT_READ','INCIDENT_LIKE','INCIDENT_COMMENT',
    'CONFLIT_CREATE','CONFLIT_READ_OWN',
    'ANNONCE_READ',
    'MESSAGE_SEND_PRIVATE','MESSAGE_SEND_GROUPE','MESSAGE_DELETE_OWN',
    'DOCUMENT_READ',
    'FEED_READ','FEED_CREATE','FEED_DELETE_OWN','FEED_LIKE','FEED_COMMENT'
) AND is_deleted = FALSE
ON CONFLICT (profil_id, feature_id, version_tag) DO NOTHING;

-- ── Snapshots initiaux (v1.0) ────────────────────────────────
DO $$
BEGIN
    CALL snapshot_profil_features(1, 'v1.0', 'Initialisation MVP — toutes features SUPER_ADMIN');
    CALL snapshot_profil_features(2, 'v1.0', 'Initialisation MVP — features ADMIN');
    CALL snapshot_profil_features(3, 'v1.0', 'Initialisation MVP — features SYNDIC');
    CALL snapshot_profil_features(4, 'v1.0', 'Initialisation MVP — features CHEF_SECURITE');
    CALL snapshot_profil_features(5, 'v1.0', 'Initialisation MVP — features HABITANT');
END $$;

-- ── Canaux de paiement ──────────────────────────────────────
INSERT INTO canal_paiement (id, libelle, code, is_manuel, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    (1, 'Paystack',     'PAYSTACK',      false, '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (2, 'Wave Manuel',  'WAVE_MANUEL',   true,  '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (3, 'Orange Money', 'ORANGE_MANUEL', true,  '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (4, 'MTN Money',    'MTN_MANUEL',    true,  '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (5, 'Cash',         'CASH',          true,  '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Statuts paiement ─────────────────────────────────────────
INSERT INTO statut_paiement (id, libelle, code, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    (1, 'En attente', 'EN_ATTENTE', '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (2, 'Confirmé',   'CONFIRME',   '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (3, 'Échoué',     'ECHOUE',     '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (4, 'Remboursé',  'REMBOURSE',  '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Motifs alerte ────────────────────────────────────────────
INSERT INTO motif_alerte (id, libelle, code, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    (1, 'Intrusion / Agression', 'INTRUSION_AGRESSION', '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (2, 'Malaise médical',       'MALAISE_MEDICAL',     '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (3, 'Incendie',              'INCENDIE',            '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (4, 'Autre urgence',         'AUTRE_URGENCE',       '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Statuts alerte ───────────────────────────────────────────
INSERT INTO statut_alerte (id, libelle, code, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    (10, 'Reçue',           'RECUE',           '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (11, 'Agent en route',  'AGENT_EN_ROUTE',  '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (12, 'Agent sur place', 'AGENT_SUR_PLACE', '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (13, 'Résolue',         'RESOLUE',         '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Catégories incidents ─────────────────────────────────────
INSERT INTO categorie_incident (id, libelle, code, icon_name, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    (1, 'Électricité',   'ELECTRICITE',   'Zap',         '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (2, 'Eau',           'EAU',           'Droplets',    '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (3, 'Stationnement', 'STATIONNEMENT', 'Car',         '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (4, 'Propreté',      'PROPRETE',      'Trash2',      '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (5, 'Sécurité',      'SECURITE',      'ShieldAlert', '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (6, 'Autre',         'AUTRE',         'CircleAlert', '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Catégories conflits ──────────────────────────────────────
INSERT INTO categorie_conflit (id, libelle, code, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    (1, 'Bruit',         'BRUIT',         '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (2, 'Stationnement', 'STATIONNEMENT', '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (3, 'Ordures',       'ORDURES',       '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (4, 'Animaux',       'ANIMAUX',       '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (5, 'Espace commun', 'ESPACE_COMMUN', '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (6, 'Autre',         'AUTRE',         '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Statuts conflits ─────────────────────────────────────────
INSERT INTO statut_conflit (id, libelle, code, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    (1, 'Signalé',           'SIGNALE',           '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (2, 'En médiation',      'EN_MEDIATION',      '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (3, 'Résolu',            'RESOLU',            '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (4, 'Classé sans suite', 'CLASSE_SANS_SUITE', '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Types documents ──────────────────────────────────────────
INSERT INTO type_document (id, libelle, code, extension, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    (1, 'PDF',  'PDF',  'pdf',  '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (2, 'Word', 'WORD', 'docx', '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Catégories annonces ──────────────────────────────────────
INSERT INTO categorie_annonce (id, libelle, code, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    (1, 'Général',     'GENERAL',     '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (2, 'Maintenance', 'MAINTENANCE', '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (3, 'Sécurité',    'SECURITE',    '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (4, 'Urgent',      'URGENT',      '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (5, 'Événement',   'EVENEMENT',   '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Types notifications ──────────────────────────────────────
INSERT INTO type_notification (id, libelle, code, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    (1,  'Paiement confirmé Paystack', 'PAIEMENT_CONFIRME_PAYSTACK', '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (2,  'Paiement confirmé Manuel',   'PAIEMENT_CONFIRME_MANUEL',   '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (3,  'Nouvelle alerte sécurité',   'NOUVELLE_ALERTE',            '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (4,  'Alerte escaladée',           'ALERTE_ESCALADEE',           '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (5,  'Nouveau message privé',      'NOUVEAU_MESSAGE',            '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (6,  'Nouveau message groupe',     'NOUVEAU_MESSAGE_GROUPE',     '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (7,  'Nouvelle annonce',           'NOUVELLE_ANNONCE',           '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (8,  'Nouvel incident signalé',    'NOUVEL_INCIDENT',            '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (9,  'Statut conflit mis à jour',  'CONFLIT_STATUT_UPDATE',      '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (10, 'Like sur incident',          'INCIDENT_LIKE',              '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (11, 'Commentaire sur incident',   'INCIDENT_COMMENTAIRE',       '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (12, 'Nouveau post',               'FEED_POST',                  '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (13, 'Like sur post',              'FEED_LIKE',                  '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    (14, 'Commentaire sur post',       'FEED_COMMENTAIRE',           '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── App config ───────────────────────────────────────────────
INSERT INTO app_config ("key", value, module, description, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    -- Auth & Sessions
    ('JWT_EXPIRY_HOURS',              '24',                         'AUTH',        'Durée de vie JWT access token (heures)',                         '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('JWT_REFRESH_EXPIRY_DAYS',       '7',                          'AUTH',        'Durée de vie refresh token (jours)',                              '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('REDIS_SESSION_TTL_SECONDS',     '86400',                      'AUTH',        'TTL session Redis avec features RBAC (24h)',                      '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('REDIS_MSG_LU_TTL_DAYS',         '30',                         'MESSAGE',     'TTL état lu/non-lu message Redis (jours)',                        '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('RATE_LIMIT_AUTH_PER_MIN',       '10',                         'SECURITE',    'Requêtes max /auth par IP par minute',                           '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    -- OTP — Gmail SMTP
    ('GMAIL_USER',                    'noreply@mysyndic.ci',        'EMAIL',       'Compte Gmail expéditeur OTP',                                    '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('GMAIL_APP_PASSWORD',            '',                           'EMAIL',       'App password Gmail (à remplir en prod — jamais le vrai MDP)',    '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('SMTP_HOST',                     'smtp.gmail.com',             'EMAIL',       'Host SMTP Gmail',                                                '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('SMTP_PORT',                     '587',                        'EMAIL',       'Port SMTP Gmail (STARTTLS)',                                     '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('SMTP_SECURE',                   'false',                      'EMAIL',       'SSL direct (false = STARTTLS sur port 587)',                     '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('SMTP_FROM_NAME',                'MySyndic',                   'EMAIL',       'Nom affiché dans le champ From',                                '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('OTP_MAX_ATTEMPTS',              '3',                          'AUTH',        'Tentatives OTP max avant blocage',                               '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    -- Paiement
    ('COTISATION_DEFAUT_FCFA',        '25000',                      'PAIEMENT',    'Montant cotisation mensuelle par défaut (FCFA)',                  '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('MULTI_MOIS_PAIEMENT_MAX',       '12',                         'PAIEMENT',    'Mois max régularisables en une saisie manuelle',                 '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('PAIEMENT_EXPIRATION_MINUTES',   '30',                         'PAIEMENT',    'Délai (min) avant annulation d un paiement Paystack resté en attente ; 0 = désactivé', '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    -- Paystack — clés master du compte marchand (subaccounts par cité dans configuration)
    ('PAYSTACK_SECRET_KEY',           '',                           'PAIEMENT',    'Clé secrète Paystack master — API + vérification signature webhook (HMAC)', '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('PAYSTACK_CURRENCY',             'XOF',                        'PAIEMENT',    'Devise Paystack du compte marchand',                              '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    -- OTP
    ('OTP_EXPIRY_MINUTES',            '10',                         'AUTH',        'Durée de vie OTP en minutes (expire_at = now + ce délai)',       '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    -- MinIO — tous les buckets centralisés ici, pas dans les tables métier
    ('MINIO_ENDPOINT',                'localhost',                  'STORAGE',     'Endpoint MinIO (IP ou hostname)',                                '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('MINIO_PORT',                    '9000',                       'STORAGE',     'Port MinIO API',                                                '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('MINIO_ACCESS_KEY',              '',                           'STORAGE',     'Clé d''accès MinIO (à remplir en prod)',                         '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('MINIO_SECRET_KEY',              '',                           'STORAGE',     'Clé secrète MinIO (à remplir en prod)',                          '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('MINIO_USE_SSL',                 'false',                      'STORAGE',     'TLS MinIO (true en prod)',                                       '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('MINIO_BUCKET_DOCUMENTS',        'mysyndic-documents',         'STORAGE',     'Bucket MinIO — documents syndic + reçus PDF',                   '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('MINIO_BUCKET_MEDIA',            'mysyndic-media',             'STORAGE',     'Bucket MinIO — photos alertes, incidents, avatars, preuves',     '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('MINIO_PRESIGNED_URL_TTL_SEC',   '3600',                       'STORAGE',     'TTL URLs pré-signées MinIO (secondes)',                          '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    -- Webhook — agrégateur paramétré ici, pas hardcodé dans le code
    ('WEBHOOK_AGGREGATEUR_ACTIF',     'PAYSTACK',                   'WEBHOOK',     'Agrégateur de paiement actif — copié dans webhook.aggregateur_code à la réception', '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('WEBHOOK_WAVE_SECRET',           '',                           'WEBHOOK',     'Clé HMAC Wave (pour V2 quand Wave fournit des webhooks)',        '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    -- Sécurité alertes
    ('ALERTE_ESCALADE_MINUTES',       '3',                          'SECURITE',    'Délai avant escalade alerte non traitée (min)',                  '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('ESCALADE_JOB_INTERVAL_SEC',     '60',                         'SECURITE',    'Fréquence job escalade serveur (secondes)',                      '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('SMS_ALERTE_ACTIF',              'false',                      'NOTIFICATION','SMS Africa''s Talking pour alertes (false en MVP — Gmail actif)', '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    -- Incidents & messages
    ('COMMENT_NIVEAU_MAX',            '2',                          'INCIDENT',    'Profondeur max commentaires incidents',                           '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('MONGO_MSG_COLLECTION',          'messages',                   'MESSAGE',     'Nom de la collection MongoDB pour contenu messages',              '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    -- Reçu PDF
    ('RECU_PDF_QR_BASE_URL',          'https://mysyndic.ci/verify/','PAIEMENT',    'URL base du QR code de vérification des reçus',                  '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    -- RBAC versionning
    ('RBAC_CURRENT_VERSION',          'v1.0',                       'RBAC',        'Version active des features RBAC chargée dans Redis au login',   '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('AUDIT_LOG_RETENTION_MONTHS',    '24',                         'AUDIT',       'Durée de rétention des logs d''audit (mois)',                    '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    -- Feed social
    ('FEED_VIDEO_MAX_MO',             '50',                         'FEED',        'Taille max d''une vidéo de feed (Mo)',                           '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL),
    ('FEED_PHOTOS_MAX',               '3',                          'FEED',        'Nombre max de photos par post de feed',                          '2026-09-01 00:00:00', NULL, NULL, false, 0, NULL, NULL)
ON CONFLICT ("key") DO NOTHING;

-- ============================================================
-- SEED — DONNÉES DE DÉMONSTRATION
-- ============================================================

-- ── Cités ───────────────────────────────────────────────────
INSERT INTO cite (id, nom, ville, pays, is_active, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    ('00000000-0000-0000-0000-000000000001', 'Synacassy 1',             'Abidjan — Cocody',  'Côte d''Ivoire', true, '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-0000-000000000002', 'Résidence Les Orchidées', 'Abidjan — Yopougon','Côte d''Ivoire', true, '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-0000-000000000003', 'Cité Palmier d''Or',      'Abidjan — Marcory', 'Côte d''Ivoire', true, '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Configuration Synacassy 1 ────────────────────────────────
INSERT INTO configuration (id, cite_id, cotisation_mensuelle, lien_wave, telephone_syndic, telephone_urgence, paystack_subaccount_code, paystack_subaccount_mode, paystack_subaccount_split, nombre_villas_attendu, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    ('00000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001',
     25000, 'https://pay.wave.com/m/synacassy1',
     '+225 07 00 00 01', '+225 07 00 00 02',
     NULL, 'SIMPLE', 100, 143,
     '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Villas Synacassy 1 ───────────────────────────────────────
INSERT INTO villa (id, cite_id, numero, rue, is_active, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    ('00000000-0000-0000-AAAA-000000000001', '00000000-0000-0000-0000-000000000001', '3',  'Rue des Palmiers',  true, '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-AAAA-000000000002', '00000000-0000-0000-0000-000000000001', '7',  'Rue des Manguiers', true, '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-AAAA-000000000003', '00000000-0000-0000-0000-000000000001', '11', 'Rue des Cocotiers', true, '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-AAAA-000000000004', '00000000-0000-0000-0000-000000000001', '14', 'Rue des Palmiers',  true, '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-AAAA-000000000005', '00000000-0000-0000-0000-000000000001', '15', 'Rue des Bananiers', true, '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-AAAA-000000000006', '00000000-0000-0000-0000-000000000001', '19', 'Rue des Cocotiers', true, '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-AAAA-000000000007', '00000000-0000-0000-0000-000000000001', '22', 'Rue des Bananiers', true, '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-AAAA-000000000008', '00000000-0000-0000-0000-000000000001', '31', 'Rue des Palmiers',  true, '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Utilisateurs (sans profil_id — géré par user_profil) ─────
INSERT INTO "user" (id, cite_id, prenom, nom, email, telephone, password_hash, must_change_password, is_active, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    ('00000000-0000-0000-0000-000000000100', NULL,                                   'Germain', 'Edi',       'germain@mysyndic.ci',         '+225 07 00 00 00', '$2b$12$HASH_SUPER_ADMIN',  false, true, '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-000000000001', 'Germain', 'Edi',       'admin.s1@mysyndic.ci',        '+225 07 00 00 03', '$2b$12$HASH_ADMIN',        false, true, '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', 'Ama',     'Sika',      'ama.sika@mysyndic.ci',        '+225 07 00 00 04', '$2b$12$HASH_SYNDIC',       false, true, '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001', 'Moussa',  'Koné',      'm.kone@mysyndic.ci',          '+225 07 00 00 05', '$2b$12$HASH_CHEF_SECU',   true,  true, '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000001', 'Kofi',    'Mensah',    'kofi.mensah@email.com',       '+225 07 12 34 56', '$2b$12$HASH_KOFI',         false, true, '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000001', 'Ama',     'Brou',      'ama.brou@email.com',          '+225 07 23 45 67', '$2b$12$HASH_AMA_B',        false, true, '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-000000000001', 'Yao',     'Kouassi',   'yao.kouassi@email.com',       '+225 07 34 56 78', '$2b$12$HASH_YAO',          false, true, '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-0000-000000000107', '00000000-0000-0000-0000-000000000001', 'Fatou',   'Diallo',    'fatou.diallo@email.com',      '+225 07 45 67 89', '$2b$12$HASH_FATOU',        false, true, '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-0000-000000000108', '00000000-0000-0000-0000-000000000001', 'Mamadou', 'Ouédraogo', 'mamadou.ouedraogo@email.com', '+225 07 56 78 90', '$2b$12$HASH_MAMADOU',      false, true, '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    -- 2e occupant Villa 14 (illustre plusieurs users / même villa)
    ('00000000-0000-0000-0000-000000000109', '00000000-0000-0000-0000-000000000001', 'Adjoa',   'Mensah',    'adjoa.mensah@email.com',      '+225 07 98 76 54', '$2b$12$HASH_ADJOA',        false, true, '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── user_profil — multi-profil [v3] ─────────────────────────
-- Germain (00...100) = SUPER_ADMIN global (cite_id NULL)
-- Germain (00...101) = aussi ADMIN de Synacassy 1 (même email, compte séparé par cité)
-- Ama Sika = SYNDIC + HABITANT (double profil dans la même cité, illustratif)
INSERT INTO user_profil (id, user_id, profil_id, cite_id, order_priority, is_active, assigned_at, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    -- Germain super admin (profil global)
    ('00000000-0000-0000-D000-000000000001', '00000000-0000-0000-0000-000000000100', 1, NULL,                                   1, true, '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    -- Germain aussi admin Synacassy 1 (même user, 2e profil)
    ('00000000-0000-0000-D000-000000000002', '00000000-0000-0000-0000-000000000100', 2, '00000000-0000-0000-0000-000000000001', 2, true, '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    -- Admin compte Synacassy 1 dédié
    ('00000000-0000-0000-D000-000000000003', '00000000-0000-0000-0000-000000000101', 2, '00000000-0000-0000-0000-000000000001', 1, true, '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    -- Ama Sika : SYNDIC en priorité 1, HABITANT en 2 (double profil illustratif)
    ('00000000-0000-0000-D000-000000000004', '00000000-0000-0000-0000-000000000102', 3, '00000000-0000-0000-0000-000000000001', 1, true, '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-D000-000000000005', '00000000-0000-0000-0000-000000000102', 5, '00000000-0000-0000-0000-000000000001', 2, true, '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    -- Moussa : Chef Sécurité (must_change_password = TRUE)
    ('00000000-0000-0000-D000-000000000006', '00000000-0000-0000-0000-000000000103', 4, '00000000-0000-0000-0000-000000000001', 1, true, '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    -- Habitants
    ('00000000-0000-0000-D000-000000000007', '00000000-0000-0000-0000-000000000104', 5, '00000000-0000-0000-0000-000000000001', 1, true, '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-D000-000000000008', '00000000-0000-0000-0000-000000000105', 5, '00000000-0000-0000-0000-000000000001', 1, true, '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-D000-000000000009', '00000000-0000-0000-0000-000000000106', 5, '00000000-0000-0000-0000-000000000001', 1, true, '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-D000-000000000010', '00000000-0000-0000-0000-000000000107', 5, '00000000-0000-0000-0000-000000000001', 1, true, '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-D000-000000000011', '00000000-0000-0000-0000-000000000108', 5, '00000000-0000-0000-0000-000000000001', 1, true, '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-D000-000000000012', '00000000-0000-0000-0000-000000000109', 5, '00000000-0000-0000-0000-000000000001', 1, true, '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Liaisons user ↔ villa ───────────────────────────────────
INSERT INTO user_villa (id, user_id, villa_id, cite_id, is_current, assigned_at, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    ('00000000-0000-0000-D100-000000000001', '00000000-0000-0000-0000-000000000104', '00000000-0000-0000-AAAA-000000000004', '00000000-0000-0000-0000-000000000001', true, '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-D100-000000000002', '00000000-0000-0000-0000-000000000109', '00000000-0000-0000-AAAA-000000000004', '00000000-0000-0000-0000-000000000001', true, '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-D100-000000000003', '00000000-0000-0000-0000-000000000105', '00000000-0000-0000-AAAA-000000000002', '00000000-0000-0000-0000-000000000001', true, '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-D100-000000000004', '00000000-0000-0000-0000-000000000106', '00000000-0000-0000-AAAA-000000000007', '00000000-0000-0000-0000-000000000001', true, '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-D100-000000000005', '00000000-0000-0000-0000-000000000107', '00000000-0000-0000-AAAA-000000000001', '00000000-0000-0000-0000-000000000001', true, '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-D100-000000000006', '00000000-0000-0000-0000-000000000108', '00000000-0000-0000-AAAA-000000000003', '00000000-0000-0000-0000-000000000001', true, '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Groupes cité (1 par cité) ────────────────────────────────
INSERT INTO groupe_cite (id, cite_id, nom, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    ('00000000-0000-0000-D200-000000000001', '00000000-0000-0000-0000-000000000001', 'Chat Synacassy 1',             '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-D200-000000000002', '00000000-0000-0000-0000-000000000002', 'Chat Résidence Les Orchidées', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    ('00000000-0000-0000-D200-000000000003', '00000000-0000-0000-0000-000000000003', 'Chat Cité Palmier d''Or',      '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Membres groupe Synacassy 1 (tous les users de la cité) ───
INSERT INTO groupe_cite_membre (id, groupe_id, user_id, cite_id, joined_at, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    (gen_random_uuid(), '00000000-0000-0000-D200-000000000001', '00000000-0000-0000-0000-000000000102', '00000000-0000-0000-0000-000000000001', '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    (gen_random_uuid(), '00000000-0000-0000-D200-000000000001', '00000000-0000-0000-0000-000000000103', '00000000-0000-0000-0000-000000000001', '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    (gen_random_uuid(), '00000000-0000-0000-D200-000000000001', '00000000-0000-0000-0000-000000000104', '00000000-0000-0000-0000-000000000001', '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    (gen_random_uuid(), '00000000-0000-0000-D200-000000000001', '00000000-0000-0000-0000-000000000105', '00000000-0000-0000-0000-000000000001', '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    (gen_random_uuid(), '00000000-0000-0000-D200-000000000001', '00000000-0000-0000-0000-000000000106', '00000000-0000-0000-0000-000000000001', '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    (gen_random_uuid(), '00000000-0000-0000-D200-000000000001', '00000000-0000-0000-0000-000000000107', '00000000-0000-0000-0000-000000000001', '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    (gen_random_uuid(), '00000000-0000-0000-D200-000000000001', '00000000-0000-0000-0000-000000000108', '00000000-0000-0000-0000-000000000001', '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL),
    (gen_random_uuid(), '00000000-0000-0000-D200-000000000001', '00000000-0000-0000-0000-000000000109', '00000000-0000-0000-0000-000000000001', '2026-09-01 00:00:00', '2026-09-01 00:00:00', NULL, NULL, false, NULL, NULL, NULL)
ON CONFLICT (groupe_id, user_id) DO NOTHING;

-- ── Paiements (liés aux villas) ──────────────────────────────
INSERT INTO paiement (id, cite_id, villa_id, saisi_par, mois, montant, statut_id, canal_id, reference_paystack, reference_externe, note, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    -- Villa 14 — 8 mois payés (Kofi + Adjoa voient le même historique)
    ('00000000-0000-0000-D300-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-AAAA-000000000004','00000000-0000-0000-0000-000000000104','2026-01',25000,2,1,'pstk_jan_2026',NULL,NULL,'2026-01-28 10:00:00',NULL,NULL,false,NULL,NULL,NULL),
    ('00000000-0000-0000-D300-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-AAAA-000000000004','00000000-0000-0000-0000-000000000104','2026-02',25000,2,1,'pstk_fev_2026',NULL,NULL,'2026-02-25 11:00:00',NULL,NULL,false,NULL,NULL,NULL),
    ('00000000-0000-0000-D300-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-AAAA-000000000004','00000000-0000-0000-0000-000000000104','2026-03',25000,2,1,'pstk_mar_2026',NULL,NULL,'2026-03-27 09:30:00',NULL,NULL,false,NULL,NULL,NULL),
    ('00000000-0000-0000-D300-000000000004','00000000-0000-0000-0000-000000000001','00000000-0000-0000-AAAA-000000000004','00000000-0000-0000-0000-000000000104','2026-04',25000,2,1,'pstk_avr_2026',NULL,NULL,'2026-04-29 14:00:00',NULL,NULL,false,NULL,NULL,NULL),
    ('00000000-0000-0000-D300-000000000005','00000000-0000-0000-0000-000000000001','00000000-0000-0000-AAAA-000000000004','00000000-0000-0000-0000-000000000104','2026-05',25000,2,1,'pstk_mai_2026',NULL,NULL,'2026-05-26 16:00:00',NULL,NULL,false,NULL,NULL,NULL),
    ('00000000-0000-0000-D300-000000000006','00000000-0000-0000-0000-000000000001','00000000-0000-0000-AAAA-000000000004','00000000-0000-0000-0000-000000000102','2026-06',25000,2,2,NULL,'WV-202606141523','Wave syndic','2026-06-14 15:23:00',NULL,NULL,false,NULL,NULL,NULL),
    ('00000000-0000-0000-D300-000000000007','00000000-0000-0000-0000-000000000001','00000000-0000-0000-AAAA-000000000004','00000000-0000-0000-0000-000000000104','2026-07',25000,2,2,NULL,'WV-202607281201',NULL,'2026-07-28 12:01:00',NULL,NULL,false,NULL,NULL,NULL),
    ('00000000-0000-0000-D300-000000000008','00000000-0000-0000-0000-000000000001','00000000-0000-0000-AAAA-000000000004','00000000-0000-0000-0000-000000000104','2026-08',25000,2,1,'pstk_aout_2026',NULL,NULL,'2026-08-28 18:42:00',NULL,NULL,false,NULL,NULL,NULL),
    ('00000000-0000-0000-D300-000000000009','00000000-0000-0000-0000-000000000001','00000000-0000-0000-AAAA-000000000004',NULL,'2026-09',25000,1,NULL,NULL,NULL,NULL,'2026-09-01 00:00:00',NULL,NULL,false,NULL,NULL,NULL),
    -- Villa 7
    ('00000000-0000-0000-D300-000000000020','00000000-0000-0000-0000-000000000001','00000000-0000-0000-AAAA-000000000002','00000000-0000-0000-0000-000000000105','2026-09',25000,2,1,'pstk_ama_sep',NULL,NULL,'2026-09-02 09:10:00',NULL,NULL,false,NULL,NULL,NULL),
    -- Villa 22 — impayé
    ('00000000-0000-0000-D300-000000000030','00000000-0000-0000-0000-000000000001','00000000-0000-0000-AAAA-000000000007',NULL,'2026-09',25000,1,NULL,NULL,NULL,NULL,'2026-09-01 00:00:00',NULL,NULL,false,NULL,NULL,NULL),
    -- Villa 3 — MTN manuel
    ('00000000-0000-0000-D300-000000000040','00000000-0000-0000-0000-000000000001','00000000-0000-0000-AAAA-000000000001','00000000-0000-0000-0000-000000000102','2026-09',25000,2,4,NULL,'MTN-202609011834',NULL,'2026-09-01 18:34:00',NULL,NULL,false,NULL,NULL,NULL),
    -- Villa 11 — en attente
    ('00000000-0000-0000-D300-000000000050','00000000-0000-0000-0000-000000000001','00000000-0000-0000-AAAA-000000000003',NULL,'2026-09',25000,1,NULL,NULL,NULL,NULL,'2026-09-02 00:00:00',NULL,NULL,false,NULL,NULL,NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Alertes sécurité ─────────────────────────────────────────
INSERT INTO alerte_securite (id, cite_id, habitant_id, villa_id, motif_id, description, silencieuse, statut_id, escalade, escalade_at, resolu_par, resolu_at, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    ('00000000-0000-0000-D400-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000106','00000000-0000-0000-AAAA-000000000007',1,'Individu suspect aperçu dans le jardin.',false,11,true,'2026-09-03 14:35:00',NULL,NULL,'2026-09-03 14:32:00','2026-09-03 14:35:00',NULL,false,NULL,NULL,NULL),
    ('00000000-0000-0000-D400-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000105','00000000-0000-0000-AAAA-000000000002',2,'Personne âgée, perte de connaissance.',false,11,false,NULL,NULL,NULL,'2026-09-03 11:13:00','2026-09-03 11:15:00',NULL,false,NULL,NULL,NULL),
    ('00000000-0000-0000-D400-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000108','00000000-0000-0000-AAAA-000000000003',4,NULL,true,10,false,NULL,NULL,NULL,'2026-09-03 14:40:00',NULL,NULL,false,NULL,NULL,NULL),
    ('00000000-0000-0000-D400-000000000004','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000107','00000000-0000-0000-AAAA-000000000001',4,'Bruit suspect portail secondaire.',false,13,false,NULL,'00000000-0000-0000-0000-000000000103','2026-09-03 09:47:00','2026-09-03 09:22:00','2026-09-03 09:47:00',NULL,false,NULL,NULL,NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Incidents ────────────────────────────────────────────────
INSERT INTO incident (id, cite_id, auteur_id, villa_id, categorie_id, titre, description, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    ('00000000-0000-0000-D500-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000104','00000000-0000-0000-AAAA-000000000004',1,'Panne éclairage allée B','Éclairage éteint depuis ce matin sur toute l''allée B.','2026-09-03 07:30:00',NULL,NULL,false,NULL,NULL,NULL),
    ('00000000-0000-0000-D500-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000105','00000000-0000-0000-AAAA-000000000002',2,'Fuite canalisation principale','Fuite importante carrefour rue des Manguiers / allée A.','2026-09-02 16:00:00',NULL,NULL,false,NULL,NULL,NULL),
    ('00000000-0000-0000-D500-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000106','00000000-0000-0000-AAAA-000000000007',3,'Véhicule bloque accès pompiers','Véhicule sans plaque devant portail de secours depuis 3 jours.','2026-08-31 10:00:00',NULL,NULL,false,NULL,NULL,NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Likes incidents ──────────────────────────────────────────
INSERT INTO incident_like (incident_id, user_id, created_at)
VALUES
    ('00000000-0000-0000-D500-000000000001','00000000-0000-0000-0000-000000000105','2026-09-03 08:00:00'),
    ('00000000-0000-0000-D500-000000000001','00000000-0000-0000-0000-000000000107','2026-09-03 08:15:00'),
    ('00000000-0000-0000-D500-000000000001','00000000-0000-0000-0000-000000000108','2026-09-03 09:00:00'),
    ('00000000-0000-0000-D500-000000000001','00000000-0000-0000-0000-000000000106','2026-09-03 09:30:00'),
    ('00000000-0000-0000-D500-000000000002','00000000-0000-0000-0000-000000000104','2026-09-02 16:30:00'),
    ('00000000-0000-0000-D500-000000000003','00000000-0000-0000-0000-000000000104','2026-09-01 10:00:00'),
    ('00000000-0000-0000-D500-000000000003','00000000-0000-0000-0000-000000000105','2026-09-01 10:30:00')
ON CONFLICT (incident_id, user_id) DO NOTHING;

-- ── Commentaires 2 niveaux ───────────────────────────────────
INSERT INTO incident_commentaire (id, incident_id, auteur_id, parent_id, niveau, texte, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    ('00000000-0000-0000-D600-000000000001','00000000-0000-0000-D500-000000000001','00000000-0000-0000-0000-000000000105',NULL,1,'Pareil depuis hier soir, très dangereux.','2026-09-03 08:10:00',NULL,NULL,false,NULL,NULL,NULL),
    ('00000000-0000-0000-D600-000000000002','00000000-0000-0000-D500-000000000001','00000000-0000-0000-0000-000000000102',NULL,1,'Le prestataire a été contacté, réparation prévue cet après-midi.','2026-09-03 09:00:00',NULL,NULL,false,NULL,NULL,NULL),
    ('00000000-0000-0000-D600-000000000003','00000000-0000-0000-D500-000000000001','00000000-0000-0000-0000-000000000104','00000000-0000-0000-D600-000000000001',2,'Oui j''ai failli trébucher hier soir.','2026-09-03 08:20:00',NULL,NULL,false,NULL,NULL,NULL),
    ('00000000-0000-0000-D600-000000000004','00000000-0000-0000-D500-000000000001','00000000-0000-0000-0000-000000000107','00000000-0000-0000-D600-000000000002',2,'Merci Ama ! On attend ça avec impatience.','2026-09-03 09:15:00',NULL,NULL,false,NULL,NULL,NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Annonces ─────────────────────────────────────────────────
INSERT INTO annonce (id, cite_id, auteur_id, categorie_id, titre, contenu, est_epinglee, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    ('00000000-0000-0000-D700-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000102',5,'Réunion copropriétaires — 12 septembre','Ordre du jour : cotisations, entretien espaces verts, sécurité portail. Salle commune à 18h.',true,'2026-09-03 08:00:00',NULL,NULL,false,NULL,NULL,NULL),
    ('00000000-0000-0000-D700-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000102',2,'Coupure d''eau prévue vendredi matin','Coupure 8h–12h rues A et B. Prévoyez vos réserves.',false,'2026-09-02 18:00:00',NULL,NULL,false,NULL,NULL,NULL),
    ('00000000-0000-0000-D700-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000102',3,'Nouveau code portail principal','Code modifié pour raisons de sécurité. Se rapprocher du syndic.',false,'2026-08-28 10:00:00',NULL,NULL,false,NULL,NULL,NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Conflits ─────────────────────────────────────────────────
INSERT INTO conflit (id, cite_id, declarant_id, villa_declarant_id, categorie_id, villa_ciblee_id, villa_ciblee_num, description, statut_id, note_syndic, resolution_note, pris_en_charge_par, pris_en_charge_at, resolu_at, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES
    ('00000000-0000-0000-D800-000000000001','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000104','00000000-0000-0000-AAAA-000000000004',1,'00000000-0000-0000-AAAA-000000000005','15','Musique forte tous les week-ends jusqu''à 3h du matin depuis 3 semaines.',2,'Voisin Villa 15 contacté le 27/08.',NULL,'00000000-0000-0000-0000-000000000102','2026-08-27 14:00:00',NULL,'2026-08-26 20:00:00','2026-08-27 14:00:00',NULL,false,NULL,NULL,NULL),
    ('00000000-0000-0000-D800-000000000002','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000107','00000000-0000-0000-AAAA-000000000001',2,NULL,'9','Véhicule bloquant la place commune devant mon garage.',3,'Voisin informé.','Voisin s''est engagé à ne plus bloquer l''accès.','00000000-0000-0000-0000-000000000102','2026-08-06 10:00:00','2026-08-12 16:00:00','2026-08-05 09:00:00','2026-08-12 16:00:00',NULL,false,NULL,NULL,NULL),
    ('00000000-0000-0000-D800-000000000003','00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000107','00000000-0000-0000-AAAA-000000000001',3,NULL,'6','Dépôt d''ordures hors horaires autorisés.',1,NULL,NULL,NULL,NULL,NULL,'2026-09-02 19:00:00',NULL,NULL,false,NULL,NULL,NULL)
ON CONFLICT (id) DO NOTHING;

-- ── Audit log initial ────────────────────────────────────────
INSERT INTO audit_log (id, cite_id, user_id, profil_actif_code, action, entite, entite_id, anciennes_valeurs, nouvelles_valeurs, ip_address, created_at)
VALUES
    (gen_random_uuid(), NULL,                                   '00000000-0000-0000-0000-000000000100', 'SUPER_ADMIN', 'LOGIN',  'user',   '00000000-0000-0000-0000-000000000100', NULL, '{"email":"germain@mysyndic.ci"}', '127.0.0.1', '2026-09-01 08:00:00'),
    (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000102', 'SYNDIC',      'CREATE', 'paiement','00000000-0000-0000-D300-000000000006', '{}', '{"villa_id":"AAAA-4","mois":"2026-06","canal":"WAVE_MANUEL","montant":25000}', '41.202.207.11', '2026-06-14 15:25:00'),
    (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000103', 'CHEF_SECURITE','UPDATE','alerte_securite','00000000-0000-0000-D400-000000000001', '{"statut_id":10}', '{"statut_id":11}', '41.202.207.12', '2026-09-03 14:33:00'),
    (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000102', 'SYNDIC',      'UPDATE', 'conflit', '00000000-0000-0000-D800-000000000001', '{"statut_id":1}', '{"statut_id":2}', '41.202.207.11', '2026-08-27 14:05:00'),
    -- Trace du switch de profil (Ama passe en vue HABITANT)
    (gen_random_uuid(), '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000102', 'HABITANT',    'SWITCH_PROFIL', 'session', '00000000-0000-0000-0000-000000000102', '{"profil_actif":"SYNDIC"}', '{"profil_actif":"HABITANT"}', '41.202.207.11', '2026-09-03 10:00:00')
ON CONFLICT DO NOTHING;

COMMIT;

-- ============================================================
-- VUES UTILITAIRES (hors transaction)
-- ============================================================

-- Features actives d'un profil à l'instant T (utilisée au login pour Redis)
CREATE OR REPLACE VIEW v_profil_features_actives AS
SELECT
    p.id        AS profil_id,
    p.code      AS profil_code,
    f.id        AS feature_id,
    f.code      AS feature_code,
    f.module    AS feature_module,
    pf.version_tag
FROM profil_feature pf
JOIN profil p ON p.id = pf.profil_id
JOIN feature f ON f.id = pf.feature_id
WHERE pf.is_deleted = FALSE
  AND p.is_deleted  = FALSE
  AND f.is_deleted  = FALSE
  AND pf.valid_from <= CURRENT_TIMESTAMP
  AND (pf.valid_until IS NULL OR pf.valid_until > CURRENT_TIMESTAMP)
ORDER BY p.id, f.module, f.code;

-- Profils actifs d'un user (pour le sélecteur de vue front)
CREATE OR REPLACE VIEW v_user_profils AS
SELECT
    up.user_id,
    up.id               AS user_profil_id,
    p.id                AS profil_id,
    p.code              AS profil_code,
    p.libelle           AS profil_libelle,
    up.cite_id,
    c.nom               AS cite_nom,
    up.order_priority,
    up.is_active
FROM user_profil up
JOIN profil p ON p.id = up.profil_id
LEFT JOIN cite c ON c.id = up.cite_id
WHERE up.is_deleted = FALSE
  AND up.is_active  = TRUE
  AND p.is_deleted  = FALSE
ORDER BY up.user_id, up.order_priority;

-- Taux de recouvrement mensuel par cité
CREATE OR REPLACE VIEW v_recouvrement_mensuel AS
SELECT
    p.cite_id,
    c.nom                                                                   AS nom_cite,
    p.mois,
    COUNT(p.id)                                                             AS nb_villas_enregistrees,
    COUNT(p.id) FILTER (WHERE p.statut_id = 2)                              AS nb_confirmes,
    SUM(p.montant) FILTER (WHERE p.statut_id = 2)                           AS montant_collecte,
    conf.nombre_villas_attendu,
    ROUND(
        COUNT(p.id) FILTER (WHERE p.statut_id = 2)::NUMERIC
        / NULLIF(conf.nombre_villas_attendu, 0) * 100, 1
    )                                                                       AS taux_recouvrement_pct
FROM paiement p
JOIN cite c ON c.id = p.cite_id
LEFT JOIN configuration conf ON conf.cite_id = p.cite_id
WHERE p.is_deleted = FALSE
GROUP BY p.cite_id, c.nom, p.mois, conf.nombre_villas_attendu
ORDER BY p.mois DESC;

-- Historique paiements par villa (partagé entre tous ses occupants)
CREATE OR REPLACE VIEW v_historique_paiements_villa AS
SELECT
    p.id                                    AS paiement_id,
    p.villa_id,
    v.numero                                AS villa_numero,
    v.rue                                   AS villa_rue,
    p.cite_id,
    p.mois,
    p.montant,
    sp.code                                 AS statut_code,
    sp.libelle                              AS statut_libelle,
    cp.code                                 AS canal_code,
    cp.libelle                              AS canal_libelle,
    cp.is_manuel,
    p.reference_paystack,
    p.reference_externe,
    -- URL pré-signée générée côté service depuis app_config (MINIO_BUCKET_DOCUMENTS)
    -- Source de vérité du reçu = recu_paiement (paiement ne porte plus de file_path)
    recu.file_path                                      AS recu_file_path,
    saisi.prenom || ' ' || saisi.nom        AS saisi_par_nom,
    p.created_at                            AS date_enregistrement
FROM paiement p
JOIN villa v ON v.id = p.villa_id
JOIN statut_paiement sp ON sp.id = p.statut_id
LEFT JOIN canal_paiement cp ON cp.id = p.canal_id
LEFT JOIN "user" saisi ON saisi.id = p.saisi_par
LEFT JOIN recu_paiement recu ON recu.paiement_id = p.id
WHERE p.is_deleted = FALSE
ORDER BY p.mois DESC;

-- Alertes actives avec temps écoulé
CREATE OR REPLACE VIEW v_alertes_actives AS
SELECT
    a.id,
    a.cite_id,
    a.habitant_id,
    u.prenom || ' ' || u.nom                                                AS habitant_nom,
    v.numero                                                                AS villa_numero,
    v.rue                                                                   AS villa_rue,
    ma.libelle                                                              AS motif,
    ma.code                                                                 AS motif_code,
    sa.code                                                                 AS statut_code,
    sa.libelle                                                              AS statut_libelle,
    a.silencieuse,
    a.escalade,
    a.escalade_at,
    a.description,
    -- URL pré-signée générée côté service depuis app_config (MINIO_BUCKET_MEDIA) + photo_file_path
    a.photo_file_path,
    a.created_at,
    ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - a.created_at)) / 60, 1) AS minutes_ecoulees
FROM alerte_securite a
JOIN "user" u ON u.id = a.habitant_id
LEFT JOIN villa v ON v.id = a.villa_id
JOIN motif_alerte ma ON ma.id = a.motif_id
JOIN statut_alerte sa ON sa.id = a.statut_id
WHERE a.statut_id != 13
  AND a.is_deleted = FALSE
ORDER BY a.escalade DESC, a.created_at ASC;

-- Impayés du mois courant (par villa)
CREATE OR REPLACE VIEW v_impayes_mois_courant AS
SELECT
    v.cite_id,
    c.nom                               AS nom_cite,
    v.id                                AS villa_id,
    v.numero                            AS villa_numero,
    v.rue                               AS villa_rue,
    conf.cotisation_mensuelle           AS montant_attendu,
    TO_CHAR(CURRENT_DATE, 'YYYY-MM')    AS mois
FROM villa v
JOIN cite c ON c.id = v.cite_id
LEFT JOIN configuration conf ON conf.cite_id = v.cite_id
WHERE v.is_active = TRUE
  AND v.is_deleted = FALSE
  AND v.id NOT IN (
      SELECT villa_id FROM paiement
      WHERE mois      = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
        AND statut_id = 2
        AND is_deleted = FALSE
  )
ORDER BY v.cite_id, v.numero;

-- Activité récente par cité (dashboard syndic/admin)
CREATE OR REPLACE VIEW v_activite_recente AS
SELECT
    al.id,
    al.cite_id,
    al.user_id,
    u.prenom || ' ' || u.nom    AS acteur_nom,
    al.profil_actif_code        AS acteur_role,
    al.action,
    al.entite,
    al.entite_id,
    al.nouvelles_valeurs,
    al.ip_address,
    al.created_at
FROM audit_log al
LEFT JOIN "user" u ON u.id = al.user_id
ORDER BY al.created_at DESC;

-- ============================================================
-- FIN DU SCRIPT MySyndic DB v3.0
-- ============================================================
