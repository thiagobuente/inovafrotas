CREATE TABLE public.email_settings (
  id boolean PRIMARY KEY DEFAULT true,
  provider text NOT NULL DEFAULT 'brevo',
  from_name text NOT NULL DEFAULT 'SEIA — Frota Inova',
  from_email text NOT NULL DEFAULT 'frotas.01@inova.pr.gov.br',
  reply_to text,
  smtp_host text,
  smtp_port integer,
  smtp_user text,
  smtp_encryption text NOT NULL DEFAULT 'tls',
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT email_settings_singleton CHECK (id),
  CONSTRAINT email_settings_provider_check CHECK (provider IN ('brevo','resend','smtp')),
  CONSTRAINT email_settings_encryption_check CHECK (smtp_encryption IN ('tls','ssl','none'))
);

GRANT SELECT, INSERT, UPDATE ON public.email_settings TO authenticated;
GRANT ALL ON public.email_settings TO service_role;

ALTER TABLE public.email_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "managers manage email settings"
  ON public.email_settings FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER email_settings_touch
  BEFORE UPDATE ON public.email_settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.email_settings (id, provider, from_name, from_email, reply_to, enabled)
VALUES (true, 'brevo', 'SEIA — Frota Inova', 'frotas.01@inova.pr.gov.br', 'frotas.01@inova.pr.gov.br', true);