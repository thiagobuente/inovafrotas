CREATE TABLE public.notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  protocol text NOT NULL,
  requester_email text,
  recipient text NOT NULL,
  audience text NOT NULL,
  subject text NOT NULL,
  status text NOT NULL,
  provider text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.notification_logs TO authenticated;
GRANT ALL ON public.notification_logs TO service_role;

ALTER TABLE public.notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "managers read notification logs" ON public.notification_logs
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'manager'::app_role));

CREATE INDEX notification_logs_created_at_idx ON public.notification_logs (created_at DESC);
CREATE INDEX notification_logs_recipient_idx ON public.notification_logs (recipient);