-- 1) has_role: SECURITY DEFINER -> SECURITY INVOKER
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

-- user_roles select policy must not recurse through has_role
DROP POLICY IF EXISTS "read own roles" ON public.user_roles;
CREATE POLICY "read own roles" ON public.user_roles
FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- 2) user_roles: manager-only write policies
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

DROP POLICY IF EXISTS "managers assign roles" ON public.user_roles;
CREATE POLICY "managers assign roles" ON public.user_roles
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "managers update roles" ON public.user_roles;
CREATE POLICY "managers update roles" ON public.user_roles
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'manager'))
WITH CHECK (public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "managers revoke roles" ON public.user_roles;
CREATE POLICY "managers revoke roles" ON public.user_roles
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'manager'));

-- 3) drivers: restrict personal data reads
DROP POLICY IF EXISTS "drivers readable" ON public.drivers;
CREATE POLICY "drivers readable to managers and assigned requesters" ON public.drivers
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'manager')
  OR EXISTS (
    SELECT 1 FROM public.vehicle_requests r
    WHERE r.assigned_driver_id = drivers.id
      AND r.requester_id = auth.uid()
  )
);