-- Adiciona o provedor Gmail às configurações de e-mail.
ALTER TABLE public.email_settings
DROP CONSTRAINT IF EXISTS email_settings_provider_check;

ALTER TABLE public.email_settings
ADD CONSTRAINT email_settings_provider_check CHECK (provider IN ('brevo', 'resend', 'smtp', 'google_mail'));
