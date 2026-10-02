DROP POLICY IF EXISTS "vehicles readable" ON public.vehicles;

CREATE POLICY "managers read all vehicles"
ON public.vehicles FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'manager'::app_role));

CREATE POLICY "requesters read vehicles assigned to their requests"
ON public.vehicles FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.vehicle_requests r
  WHERE r.assigned_vehicle_id = vehicles.id
    AND r.requester_id = auth.uid()
));