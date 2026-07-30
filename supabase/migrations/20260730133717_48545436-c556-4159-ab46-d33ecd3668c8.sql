CREATE TYPE public.app_role AS ENUM ('manager', 'requester');
CREATE TYPE public.request_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled', 'completed');
CREATE TYPE public.vehicle_status AS ENUM ('available', 'in_use', 'maintenance', 'inactive');

CREATE OR REPLACE FUNCTION public.is_institutional_email(_email text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(coalesce(_email, '')) LIKE '%@inova.pr.gov.br'
$$;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  department text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate text NOT NULL UNIQUE,
  brand text NOT NULL,
  model text NOT NULL,
  vehicle_type text NOT NULL DEFAULT 'car',
  capacity int NOT NULL DEFAULT 5,
  status public.vehicle_status NOT NULL DEFAULT 'available',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicles TO authenticated;
GRANT ALL ON public.vehicles TO service_role;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.vehicle_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  protocol text NOT NULL UNIQUE DEFAULT ('SEIA-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))),
  requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requester_email text NOT NULL,
  agenda text NOT NULL,
  destination text NOT NULL,
  pickup_at timestamptz NOT NULL,
  return_at timestamptz NOT NULL,
  passengers_count int NOT NULL DEFAULT 1,
  needs_driver boolean NOT NULL DEFAULT false,
  notes text,
  status public.request_status NOT NULL DEFAULT 'pending',
  assigned_vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  decision_note text,
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vehicle_requests_status_idx ON public.vehicle_requests (status, created_at DESC);
CREATE INDEX vehicle_requests_requester_idx ON public.vehicle_requests (requester_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.vehicle_requests TO authenticated;
GRANT ALL ON public.vehicle_requests TO service_role;
ALTER TABLE public.vehicle_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own profile select" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() AND public.is_institutional_email(email));
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "read own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "vehicles readable" ON public.vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY "managers manage vehicles" ON public.vehicles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager')) WITH CHECK (public.has_role(auth.uid(), 'manager'));

CREATE POLICY "requests select" ON public.vehicle_requests FOR SELECT TO authenticated
  USING (requester_id = auth.uid() OR public.has_role(auth.uid(), 'manager'));
CREATE POLICY "requests insert" ON public.vehicle_requests FOR INSERT TO authenticated
  WITH CHECK (
    requester_id = auth.uid()
    AND public.is_institutional_email(requester_email)
    AND public.is_institutional_email(auth.jwt() ->> 'email')
    AND status = 'pending'
  );
CREATE POLICY "requester cancels own" ON public.vehicle_requests FOR UPDATE TO authenticated
  USING (requester_id = auth.uid()) WITH CHECK (requester_id = auth.uid());
CREATE POLICY "managers decide" ON public.vehicle_requests FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'manager')) WITH CHECK (public.has_role(auth.uid(), 'manager'));

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER vehicle_requests_touch BEFORE UPDATE ON public.vehicle_requests
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.vehicles (plate, brand, model, vehicle_type, capacity, status) VALUES
  ('AAA1B23', 'Chevrolet', 'Onix', 'Sedan', 5, 'available'),
  ('BBB2C34', 'Fiat', 'Toro', 'Picape', 5, 'available'),
  ('CCC3D45', 'Renault', 'Master', 'Van', 15, 'available'),
  ('DDD4E56', 'Toyota', 'Corolla', 'Sedan', 5, 'maintenance');