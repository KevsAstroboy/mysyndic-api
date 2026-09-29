-- Persist la commission plateforme du sous-compte Paystack (anti-double
-- prélèvement : commission et mode SPLIT sont mutuellement exclusifs).
ALTER TABLE configuration
    ADD COLUMN IF NOT EXISTS paystack_subaccount_percentage INTEGER NOT NULL DEFAULT 0;