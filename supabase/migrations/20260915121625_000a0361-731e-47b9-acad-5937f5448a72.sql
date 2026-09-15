CREATE TABLE IF NOT EXISTS public.rate_limits (
  key text PRIMARY KEY,
  hits integer NOT NULL DEFAULT 0,
  window_start timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.rate_limits TO service_role;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(_key text, _limit integer, _window_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _hits integer;
BEGIN
  INSERT INTO public.rate_limits (key, hits, window_start)
  VALUES (_key, 1, now())
  ON CONFLICT (key) DO UPDATE
    SET hits = CASE WHEN public.rate_limits.window_start < now() - make_interval(secs => _window_seconds)
                    THEN 1 ELSE public.rate_limits.hits + 1 END,
        window_start = CASE WHEN public.rate_limits.window_start < now() - make_interval(secs => _window_seconds)
                    THEN now() ELSE public.rate_limits.window_start END
  RETURNING hits INTO _hits;

  DELETE FROM public.rate_limits WHERE window_start < now() - interval '1 day';
  RETURN _hits <= _limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;