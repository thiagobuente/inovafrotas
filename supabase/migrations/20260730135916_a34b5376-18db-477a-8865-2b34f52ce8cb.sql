REVOKE ALL ON FUNCTION public.enforce_single_manager() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_first_manager() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_first_manager() TO authenticated, service_role;