-- 0008_app_config_paystack_cleanup.sql
-- Nettoyage des clés Paystack non utilisées par le backend :
--   - PAYSTACK_PUBLIC_KEY : réservée au checkout navigateur côté frontend,
--     jamais lue par l'API → config morte supprimée.
--   - PAYSTACK_WEBHOOK_SECRET : redondant depuis que le webhook vérifie sa
--     signature HMAC avec PAYSTACK_SECRET_KEY (aucune clé webhook dédiée
--     n'existe chez Paystack) → supprimé si présent.

DELETE FROM app_config
WHERE key IN ('PAYSTACK_PUBLIC_KEY', 'PAYSTACK_WEBHOOK_SECRET');
