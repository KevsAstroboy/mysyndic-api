-- 0006_app_config_expiration_paiement.sql
-- Délai d'expiration des paiements Paystack restés en attente, paramétrable
-- via app_config (0 = désactivé). Priorité : app_config > PAIEMENT_EXPIRATION_MINUTES (.env) > 30 min.

INSERT INTO app_config ("key", value, module, description, created_at, updated_at, deleted_at, is_deleted, created_by)
VALUES ('PAIEMENT_EXPIRATION_MINUTES', '30', 'PAIEMENT',
        'Délai (min) avant annulation d un paiement Paystack resté en attente ; 0 = désactivé',
        CURRENT_TIMESTAMP, NULL, NULL, FALSE, 0)
ON CONFLICT ("key") DO NOTHING;