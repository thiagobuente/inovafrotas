CREATE OR REPLACE FUNCTION public.claim_first_manager()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _email text := auth.jwt() ->> 'email';
BEGIN
  IF _uid IS NULL OR NOT public.is_institutional_email(_email) THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'manager') THEN
    RETURN false;
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'manager')
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.claim_first_manager() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.claim_first_manager() TO authenticated;

CREATE OR REPLACE FUNCTION public.manager_exists()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'manager')
$$;
REVOKE EXECUTE ON FUNCTION public.manager_exists() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.manager_exists() TO authenticated;