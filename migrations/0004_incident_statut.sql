-- 0004_incident_statut.sql
-- Workflow de traitement des incidents par le syndic :
--   - table référentiel statut_incident (SIGNALE / EN_COURS / RESOLU)
--   - colonnes de suivi sur incident (statut, note syndic, prise en charge, résolution)
--   - feature RBAC INCIDENT_MANAGE + octroi SUPER_ADMIN / ADMIN / SYNDIC

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

ALTER TABLE incident ADD COLUMN IF NOT EXISTS statut_id          INT4 REFERENCES statut_incident(id);
ALTER TABLE incident ADD COLUMN IF NOT EXISTS note_syndic        TEXT;
ALTER TABLE incident ADD COLUMN IF NOT EXISTS pris_en_charge_par UUID REFERENCES "user"(id);
ALTER TABLE incident ADD COLUMN IF NOT EXISTS pris_en_charge_at  TIMESTAMP;
ALTER TABLE incident ADD COLUMN IF NOT EXISTS resolu_par         UUID REFERENCES "user"(id);
ALTER TABLE incident ADD COLUMN IF NOT EXISTS resolu_at          TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_incident_statut_id ON incident(statut_id);

-- Backfill : incidents existants (non supprimés) → statut "Signalé"
UPDATE incident
   SET statut_id = 20
 WHERE statut_id IS NULL
   AND is_deleted = FALSE;

-- Feature RBAC de traitement
INSERT INTO feature (libelle, code, module, is_deleted, created_by)
VALUES ('Traiter un incident', 'INCIDENT_MANAGE', 'INCIDENT', FALSE, 0)
ON CONFLICT (code) DO NOTHING;

INSERT INTO profil_feature (profil_id, feature_id, version_tag, valid_from, is_deleted, created_by)
SELECT p.id, f.id, 'v1.0', CURRENT_TIMESTAMP, FALSE, 0
  FROM profil p
  JOIN feature f ON f.code = 'INCIDENT_MANAGE'
 WHERE p.code IN ('SUPER_ADMIN', 'ADMIN', 'SYNDIC')
ON CONFLICT (profil_id, feature_id, version_tag) DO NOTHING;
