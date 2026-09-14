-- 0007_feed.sql
-- Feed social (type Reels/Instagram) :
--   - feed_post            : publication d'un habitant/syndic (texte et/ou médias)
--   - feed_post_media      : 1 vidéo OU jusqu'à 3 photos par post
--   - feed_post_like       : like toggle (PK composite)
--   - feed_post_commentaire: commentaires 2 niveaux (self-relation)
--   - compteurs dénormalisés likes_count / commentaires_count sur feed_post
--   - features RBAC FEED_* + octrois par profil
--   - types de notification FEED_* + clés app_config
--
-- Le type du post (texte / photo / vidéo) n'est PAS stocké : il se déduit
-- des lignes feed_post_media. La vidéo est acceptée quel que soit son codec
-- (tout MIME video/*), l'extension est dérivée côté application.

-- ── Publications ─────────────────────────────────────────────
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

-- Index de pagination « keyset » du fil : couvre (cite_id, created_at DESC, id DESC)
-- sur les seuls posts vivants.
CREATE INDEX IF NOT EXISTS idx_feed_post_feed
    ON feed_post (cite_id, created_at DESC, id DESC)
    WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_feed_post_auteur_id ON feed_post (auteur_id);
CREATE INDEX IF NOT EXISTS idx_feed_post_is_deleted ON feed_post (is_deleted);

-- ── Médias (max 3 images OU 1 vidéo) ─────────────────────────
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
-- Garantit en base : au plus une vidéo par publication.
CREATE UNIQUE INDEX IF NOT EXISTS uq_feed_media_one_video
    ON feed_post_media (post_id)
    WHERE type = 'VIDEO';

-- ── Likes ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feed_post_like (
    post_id    UUID REFERENCES feed_post(id),
    user_id    UUID REFERENCES "user"(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_feed_like_user_id ON feed_post_like (user_id);

-- ── Commentaires 2 niveaux ───────────────────────────────────
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

-- ── Features RBAC ────────────────────────────────────────────
INSERT INTO feature (libelle, code, module, is_deleted, created_by)
VALUES
    ('Voir le feed',            'FEED_READ',        'FEED', FALSE, 0),
    ('Publier dans le feed',    'FEED_CREATE',      'FEED', FALSE, 0),
    ('Supprimer ses posts',     'FEED_DELETE_OWN',  'FEED', FALSE, 0),
    ('Modérer le feed',         'FEED_MODERATE',    'FEED', FALSE, 0),
    ('Liker un post',           'FEED_LIKE',        'FEED', FALSE, 0),
    ('Commenter un post',       'FEED_COMMENT',     'FEED', FALSE, 0)
ON CONFLICT (code) DO NOTHING;

-- SUPER_ADMIN, ADMIN, SYNDIC : tous les droits feed
INSERT INTO profil_feature (profil_id, feature_id, version_tag, valid_from, is_deleted, created_by)
SELECT p.id, f.id, 'v1.0', CURRENT_TIMESTAMP, FALSE, 0
  FROM profil p
  JOIN feature f ON f.code IN (
      'FEED_READ', 'FEED_CREATE', 'FEED_DELETE_OWN',
      'FEED_MODERATE', 'FEED_LIKE', 'FEED_COMMENT'
  )
 WHERE p.code IN ('SUPER_ADMIN', 'ADMIN', 'SYNDIC')
ON CONFLICT (profil_id, feature_id, version_tag) DO NOTHING;

-- CHEF_SECURITE, HABITANT : tout sauf la modération
INSERT INTO profil_feature (profil_id, feature_id, version_tag, valid_from, is_deleted, created_by)
SELECT p.id, f.id, 'v1.0', CURRENT_TIMESTAMP, FALSE, 0
  FROM profil p
  JOIN feature f ON f.code IN (
      'FEED_READ', 'FEED_CREATE', 'FEED_DELETE_OWN', 'FEED_LIKE', 'FEED_COMMENT'
  )
 WHERE p.code IN ('CHEF_SECURITE', 'HABITANT')
ON CONFLICT (profil_id, feature_id, version_tag) DO NOTHING;

-- ── Types de notification ────────────────────────────────────
INSERT INTO type_notification (id, libelle, code, created_at, is_deleted, created_by)
VALUES
    (12, 'Nouveau post',            'FEED_POST',              CURRENT_TIMESTAMP, FALSE, 0),
    (13, 'Like sur post',           'FEED_LIKE',              CURRENT_TIMESTAMP, FALSE, 0),
    (14, 'Commentaire sur post',    'FEED_COMMENTAIRE',       CURRENT_TIMESTAMP, FALSE, 0)
ON CONFLICT (id) DO NOTHING;

-- ── Paramètres applicatifs ───────────────────────────────────
INSERT INTO app_config ("key", value, module, description, created_at, is_deleted, created_by)
VALUES
    ('FEED_VIDEO_MAX_MO', '50', 'FEED', 'Taille max d''une vidéo de feed (Mo)', CURRENT_TIMESTAMP, FALSE, 0),
    ('FEED_PHOTOS_MAX',   '3',  'FEED', 'Nombre max de photos par post de feed', CURRENT_TIMESTAMP, FALSE, 0)
ON CONFLICT ("key") DO NOTHING;
