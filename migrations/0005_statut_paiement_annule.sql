-- 0005_statut_paiement_annule.sql
-- Statut "Annulé" pour les paiements Paystack expirés (abandonnés sans paiement).

INSERT INTO statut_paiement (id, libelle, code, is_deleted, created_by)
VALUES (5, 'Annulé', 'ANNULE', FALSE, 0)
ON CONFLICT (id) DO NOTHING;