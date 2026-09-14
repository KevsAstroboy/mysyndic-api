-- 0002_user_villa_confirmation.sql
-- Occupation de villa à confirmer (is_confirme).
-- - user_villa.is_confirme=false => candidature en attente (bloquée sur les
--   actions « pour la villa » tant que non confirmée).
-- - Les occupations existantes sont confirmées d'office (valeur par défaut).
-- Feature VILLA_GERER_CANDIDATURES pour le circuit « première occupation »
-- (SUPER_ADMIN/ADMIN/SYNDIC).
-- Idempotent.

-- Colonne de confirmation d'occupation
ALTER TABLE user_villa ADD COLUMN IF NOT EXISTS is_confirme boolean NOT NULL DEFAULT true;

-- Feature
INSERT INTO feature (libelle, code, module, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES ('Gérer candidatures d''occupation', 'VILLA_GERER_CANDIDATURES', 'VILLA', CURRENT_TIMESTAMP, NULL, NULL, false, 0, NULL, NULL)
ON CONFLICT (code) DO NOTHING;

-- SUPER_ADMIN (1) — nouvelle version de snapshot v1.2 (v1.1 déjà prise par 0001)
INSERT INTO profil_feature (profil_id, feature_id, version_tag, valid_from, created_at, is_deleted, created_by)
SELECT 1, id, 'v1.2', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false, 0
FROM feature WHERE code = 'VILLA_GERER_CANDIDATURES' AND is_deleted = FALSE
ON CONFLICT (profil_id, feature_id, version_tag) DO NOTHING;
CALL snapshot_profil_features(1, 'v1.2', 'Ajout VILLA_GERER_CANDIDATURES');

-- ADMIN (2)
INSERT INTO profil_feature (profil_id, feature_id, version_tag, valid_from, created_at, is_deleted, created_by)
SELECT 2, id, 'v1.1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false, 0
FROM feature WHERE code = 'VILLA_GERER_CANDIDATURES' AND is_deleted = FALSE
ON CONFLICT (profil_id, feature_id, version_tag) DO NOTHING;
CALL snapshot_profil_features(2, 'v1.1', 'Ajout VILLA_GERER_CANDIDATURES');

-- SYNDIC (3)
INSERT INTO profil_feature (profil_id, feature_id, version_tag, valid_from, created_at, is_deleted, created_by)
SELECT 3, id, 'v1.1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false, 0
FROM feature WHERE code = 'VILLA_GERER_CANDIDATURES' AND is_deleted = FALSE
ON CONFLICT (profil_id, feature_id, version_tag) DO NOTHING;
CALL snapshot_profil_features(3, 'v1.1', 'Ajout VILLA_GERER_CANDIDATURES');
