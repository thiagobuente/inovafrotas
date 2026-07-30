-- 1. MOTORISTAS
CREATE TABLE IF NOT EXISTS public.drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  license_number text NOT NULL,
  license_category text NOT NULL DEFAULT 'B',
  phone text,
  status text NOT NULL DEFAULT 'available',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drivers TO authenticated;
GRANT ALL ON public.drivers TO service_role;
ALTER TABLE public.drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "drivers readable" ON public.drivers FOR SELECT TO authenticated USING (true);
CREATE POLICY "managers manage drivers" ON public.drivers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager')) WITH CHECK (public.has_role(auth.uid(), 'manager'));
CREATE TRIGGER drivers_touch BEFORE UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 2. MOTORISTA NA SOLICITACAO
ALTER TABLE public.vehicle_requests
  ADD COLUMN IF NOT EXISTS assigned_driver_id uuid REFERENCES public.drivers(id);

-- 3. RBAC: solicitante so pode cancelar a propria solicitacao pendente
DROP POLICY IF EXISTS "requester cancels own" ON public.vehicle_requests;
CREATE POLICY "requester cancels own" ON public.vehicle_requests FOR UPDATE TO authenticated
  USING (requester_id = auth.uid() AND status = 'pending')
  WITH CHECK (requester_id = auth.uid() AND status = 'cancelled');

CREATE OR REPLACE FUNCTION public.guard_request_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'manager') THEN
    IF NEW.assigned_vehicle_id IS DISTINCT FROM OLD.assigned_vehicle_id
       OR NEW.assigned_driver_id IS DISTINCT FROM OLD.assigned_driver_id
       OR NEW.decided_by IS DISTINCT FROM OLD.decided_by
       OR NEW.protocol IS DISTINCT FROM OLD.protocol
       OR NEW.requester_id IS DISTINCT FROM OLD.requester_id
       OR NEW.status NOT IN ('pending','cancelled') THEN
      RAISE EXCEPTION 'Somente o gestor de frota pode decidir ou designar recursos.';
    END IF;
  ELSE
    NEW.decided_by := auth.uid();
    NEW.decided_at := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_request_update() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS guard_request_update_trg ON public.vehicle_requests;
CREATE TRIGGER guard_request_update_trg BEFORE UPDATE ON public.vehicle_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_request_update();

-- 4. AGENDA: bloqueio de conflito de veiculo/motorista
CREATE OR REPLACE FUNCTION public.check_schedule_conflict()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _conflict text;
BEGIN
  IF NEW.status <> 'approved' THEN RETURN NEW; END IF;
  IF NEW.return_at <= NEW.pickup_at THEN
    RAISE EXCEPTION 'O retorno deve ser posterior à saída.';
  END IF;

  IF NEW.assigned_vehicle_id IS NOT NULL THEN
    SELECT protocol INTO _conflict FROM public.vehicle_requests
     WHERE id <> NEW.id AND status = 'approved'
       AND assigned_vehicle_id = NEW.assigned_vehicle_id
       AND pickup_at < NEW.return_at AND return_at > NEW.pickup_at
     LIMIT 1;
    IF _conflict IS NOT NULL THEN
      RAISE EXCEPTION 'Veículo já reservado no período (protocolo %).', _conflict;
    END IF;
  END IF;

  IF NEW.assigned_driver_id IS NOT NULL THEN
    SELECT protocol INTO _conflict FROM public.vehicle_requests
     WHERE id <> NEW.id AND status = 'approved'
       AND assigned_driver_id = NEW.assigned_driver_id
       AND pickup_at < NEW.return_at AND return_at > NEW.pickup_at
     LIMIT 1;
    IF _conflict IS NOT NULL THEN
      RAISE EXCEPTION 'Motorista já escalado no período (protocolo %).', _conflict;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.check_schedule_conflict() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS check_schedule_conflict_trg ON public.vehicle_requests;
CREATE TRIGGER check_schedule_conflict_trg BEFORE INSERT OR UPDATE ON public.vehicle_requests
  FOR EACH ROW EXECUTE FUNCTION public.check_schedule_conflict();

-- 5. DIARIO DE BORDO
CREATE TABLE IF NOT EXISTS public.trip_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.vehicle_requests(id) ON DELETE CASCADE,
  departure_at timestamptz,
  departure_km integer,
  return_at timestamptz,
  return_km integer,
  fuel_liters numeric(8,2),
  incidents text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.trip_logs TO authenticated;
GRANT ALL ON public.trip_logs TO service_role;
ALTER TABLE public.trip_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "trip logs select" ON public.trip_logs FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'manager')
  OR EXISTS (SELECT 1 FROM public.vehicle_requests r WHERE r.id = request_id AND r.requester_id = auth.uid())
);
CREATE POLICY "trip logs insert" ON public.trip_logs FOR INSERT TO authenticated WITH CHECK (
  created_by = auth.uid() AND EXISTS (
    SELECT 1 FROM public.vehicle_requests r WHERE r.id = request_id AND r.status = 'approved'
      AND (r.requester_id = auth.uid() OR public.has_role(auth.uid(), 'manager'))
  )
);
CREATE POLICY "trip logs update" ON public.trip_logs FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'manager')
  OR EXISTS (SELECT 1 FROM public.vehicle_requests r WHERE r.id = request_id AND r.requester_id = auth.uid())
) WITH CHECK (
  public.has_role(auth.uid(), 'manager')
  OR EXISTS (SELECT 1 FROM public.vehicle_requests r WHERE r.id = request_id AND r.requester_id = auth.uid())
);
CREATE TRIGGER trip_logs_touch BEFORE UPDATE ON public.trip_logs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 6. AUDITORIA
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  ip_address text,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  changes jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "managers read audit" ON public.audit_logs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'manager'));

CREATE OR REPLACE FUNCTION public.write_audit_log()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  _changes jsonb := '{}'::jsonb;
  _ip text;
  _k text;
BEGIN
  BEGIN
    _ip := split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  EXCEPTION WHEN others THEN _ip := NULL; END;

  IF TG_OP = 'UPDATE' THEN
    FOR _k IN SELECT key FROM jsonb_each(to_jsonb(NEW)) LOOP
      IF to_jsonb(NEW) -> _k IS DISTINCT FROM to_jsonb(OLD) -> _k THEN
        _changes := _changes || jsonb_build_object(_k, jsonb_build_object('de', to_jsonb(OLD) -> _k, 'para', to_jsonb(NEW) -> _k));
      END IF;
    END LOOP;
    IF _changes = '{}'::jsonb THEN RETURN NEW; END IF;
  ELSE
    _changes := to_jsonb(NEW);
  END IF;

  INSERT INTO public.audit_logs (user_id, user_email, ip_address, action, entity, entity_id, changes)
  VALUES (auth.uid(), auth.jwt() ->> 'email', nullif(_ip, ''), TG_OP, TG_TABLE_NAME, NEW.id, _changes);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.write_audit_log() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER audit_requests AFTER INSERT OR UPDATE ON public.vehicle_requests
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_vehicles AFTER INSERT OR UPDATE ON public.vehicles
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_drivers AFTER INSERT OR UPDATE ON public.drivers
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();
CREATE TRIGGER audit_trip_logs AFTER INSERT OR UPDATE ON public.trip_logs
  FOR EACH ROW EXECUTE FUNCTION public.write_audit_log();