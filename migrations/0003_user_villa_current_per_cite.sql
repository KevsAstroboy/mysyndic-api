-- 0003_user_villa_current_per_cite.sql
-- Permet d'être occupant « courant » dans PLUSIEURS cités en même temps.
-- Remplace l'index global (une seule is_current par user) par un index
-- unique PAR (user, cite).
-- Idempotent.

DROP INDEX IF EXISTS idx_user_villa_unique_current;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_villa_unique_current
    ON user_villa (user_id, cite_id)
    WHERE is_current = TRUE AND is_deleted = FALSE;
