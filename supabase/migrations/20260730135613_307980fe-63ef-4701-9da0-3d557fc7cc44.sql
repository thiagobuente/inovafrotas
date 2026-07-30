-- Lock down SECURITY DEFINER helpers: remove blanket PUBLIC/anon execute rights.

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.claim_first_manager() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.manager_exists() FROM PUBLIC, anon, authenticated;

-- has_role is required by RLS policies evaluated as the signed-in user.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO service_role;

-- claim_first_manager is an intentional, guarded RPC for signed-in institutional users.
GRANT EXECUTE ON FUNCTION public.claim_first_manager() TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_first_manager() TO service_role;

-- manager_exists is unused by the app; keep it internal only.
GRANT EXECUTE ON FUNCTION public.manager_exists() TO service_role;