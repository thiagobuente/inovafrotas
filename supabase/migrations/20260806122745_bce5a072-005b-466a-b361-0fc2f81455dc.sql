CREATE TABLE public.user_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_email text NOT NULL,
  audience text NOT NULL DEFAULT 'requester',
  event_type text NOT NULL,
  protocol text,
  title text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_notifications_recipient ON public.user_notifications (lower(recipient_email), created_at DESC);

GRANT SELECT, UPDATE ON public.user_notifications TO authenticated;
GRANT ALL ON public.user_notifications TO service_role;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own notifications select" ON public.user_notifications
  FOR SELECT TO authenticated
  USING (lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', '')));

CREATE POLICY "own notifications mark read" ON public.user_notifications
  FOR UPDATE TO authenticated
  USING (lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', '')))
  WITH CHECK (lower(recipient_email) = lower(coalesce(auth.jwt() ->> 'email', '')));