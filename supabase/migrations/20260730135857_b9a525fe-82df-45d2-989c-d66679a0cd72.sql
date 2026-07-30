INSERT INTO public.profiles (id, email, full_name)
VALUES ('1eb34838-1df6-46ca-bc35-ecbe5bbb4f5a', 'frotas.01@inova.pr.gov.br', 'Gestor de Frotas')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
VALUES ('1eb34838-1df6-46ca-bc35-ecbe5bbb4f5a', 'manager')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_first_manager()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _email text := lower(coalesce(auth.jwt() ->> 'email', ''));
BEGIN
  IF _uid IS NULL OR _email <> 'frotas.01@inova.pr.gov.br' THEN
    RETURN false;
  END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'manager')
  ON CONFLICT DO NOTHING;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enforce_single_manager()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.role = 'manager' AND lower(coalesce((SELECT email FROM auth.users WHERE id = NEW.user_id), '')) <> 'frotas.01@inova.pr.gov.br' THEN
    RAISE EXCEPTION 'Apenas frotas.01@inova.pr.gov.br pode ter o perfil de gestor';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS enforce_single_manager_trg ON public.user_roles;
CREATE TRIGGER enforce_single_manager_trg
BEFORE INSERT OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.enforce_single_manager();