-- 0007_sa_assign_profil.sql
-- Feature SUPER_ADMIN « assigner des profils à un user ».
-- Idempotent. Versionne le profil 1 en v1.1 pour forcer le rafraîchissement
-- de session (staleness) des SUPER_ADMIN déjà connectés.

INSERT INTO feature (libelle, code, module, created_at, updated_at, deleted_at, is_deleted, created_by, updated_by, deleted_by)
VALUES ('Assigner des profils à un user', 'SA_ASSIGN_PROFIL', 'SUPER_ADMIN', CURRENT_TIMESTAMP, NULL, NULL, false, 0, NULL, NULL)
ON CONFLICT (code) DO NOTHING;

INSERT INTO profil_feature (profil_id, feature_id, version_tag, valid_from, created_at, is_deleted, created_by)
SELECT 1, id, 'v1.1', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, false, 0
FROM feature
WHERE code = 'SA_ASSIGN_PROFIL' AND is_deleted = FALSE
ON CONFLICT (profil_id, feature_id, version_tag) DO NOTHING;

CALL snapshot_profil_features(1, 'v1.1', 'Ajout SA_ASSIGN_PROFIL');
