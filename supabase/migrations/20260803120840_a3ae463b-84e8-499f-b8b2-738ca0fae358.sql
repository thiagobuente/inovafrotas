REVOKE ALL ON FUNCTION public.claim_first_manager() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_first_manager() TO service_role;