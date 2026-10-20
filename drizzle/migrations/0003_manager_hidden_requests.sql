CREATE TABLE public.manager_hidden_requests (
 request_id uuid PRIMARY KEY REFERENCES public.vehicle_requests(id) ON DELETE CASCADE,
 hidden_by uuid NOT NULL DEFAULT auth.uid(),
 hidden_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.manager_hidden_requests TO authenticated;
GRANT ALL ON public.manager_hidden_requests TO service_role;
ALTER TABLE public.manager_hidden_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "managers read hidden requests" ON public.manager_hidden_requests FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'manager'::public.app_role));
CREATE POLICY "managers hide requests" ON public.manager_hidden_requests FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'manager'::public.app_role) AND hidden_by = auth.uid());
CREATE POLICY "managers restore requests" ON public.manager_hidden_requests FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'manager'::public.app_role));