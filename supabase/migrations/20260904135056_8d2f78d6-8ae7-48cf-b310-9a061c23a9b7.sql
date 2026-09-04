CREATE TABLE public.maintenance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  maintenance_type text NOT NULL DEFAULT 'revisao',
  description text,
  workshop text,
  performed_at date,
  performed_km integer,
  next_due_at date,
  next_due_km integer,
  cost numeric(12,2),
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_records TO authenticated;
GRANT ALL ON public.maintenance_records TO service_role;

ALTER TABLE public.maintenance_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "managers manage maintenance" ON public.maintenance_records
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'manager'::app_role))
  WITH CHECK (has_role(auth.uid(), 'manager'::app_role));

CREATE INDEX maintenance_records_vehicle_idx ON public.maintenance_records(vehicle_id);
CREATE INDEX maintenance_records_next_due_idx ON public.maintenance_records(next_due_at);

CREATE TRIGGER maintenance_records_touch
  BEFORE UPDATE ON public.maintenance_records
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.vehicle_requests ADD COLUMN calendar_event_id text;