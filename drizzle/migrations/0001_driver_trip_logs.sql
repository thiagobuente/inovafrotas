CREATE TABLE public.driver_trip_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL DEFAULT auth.uid(),
  driver_email text NOT NULL,
  driver_name text NOT NULL DEFAULT '',
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id),
  destination text,
  departure_at timestamptz,
  departure_km integer,
  return_at timestamptz,
  return_km integer,
  incidents text,
  photo_paths text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.driver_trip_logs TO authenticated;
GRANT ALL ON public.driver_trip_logs TO service_role;
ALTER TABLE public.driver_trip_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "driver logs select" ON public.driver_trip_logs FOR SELECT TO authenticated
  USING (driver_id = auth.uid() OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "driver logs insert" ON public.driver_trip_logs FOR INSERT TO authenticated
  WITH CHECK (driver_id = auth.uid() AND public.has_role(auth.uid(), 'driver')
    AND lower(driver_email) = lower(COALESCE(auth.jwt() ->> 'email', '')));
CREATE POLICY "driver logs update" ON public.driver_trip_logs FOR UPDATE TO authenticated
  USING (driver_id = auth.uid() OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (driver_id = auth.uid() OR public.has_role(auth.uid(), 'manager'));

CREATE TRIGGER driver_trip_logs_touch BEFORE UPDATE ON public.driver_trip_logs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE POLICY "drivers read vehicles" ON public.vehicles FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'driver') AND status IN ('available','in_use'));

CREATE OR REPLACE FUNCTION public.claim_driver_role()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _email text := auth.jwt() ->> 'email';
BEGIN
  IF _uid IS NULL OR NOT public.is_institutional_email(COALESCE(_email,'')) THEN RETURN false; END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'manager') THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) SELECT _uid, 'driver'
    WHERE NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _uid AND role = 'driver');
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.claim_driver_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_driver_role() TO authenticated;

CREATE OR REPLACE FUNCTION public.notify_manager_driver_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _plate text;
BEGIN
  SELECT plate INTO _plate FROM public.vehicles WHERE id = NEW.vehicle_id;
  IF TG_OP = 'INSERT' OR (NEW.return_km IS DISTINCT FROM OLD.return_km AND NEW.return_km IS NOT NULL) THEN
    INSERT INTO public.user_notifications (recipient_email, audience, event_type, title, body)
    VALUES ('frotas.01@inova.pr.gov.br', 'manager', 'driver_trip_log',
      CASE WHEN NEW.return_km IS NULL THEN 'Motorista iniciou viagem' ELSE 'Motorista concluiu diário de bordo' END,
      COALESCE(NULLIF(NEW.driver_name,''), NEW.driver_email) || ' · veículo ' || COALESCE(_plate,'—'));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER driver_trip_logs_notify AFTER INSERT OR UPDATE ON public.driver_trip_logs
  FOR EACH ROW EXECUTE FUNCTION public.notify_manager_driver_log();