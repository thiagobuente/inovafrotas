DROP POLICY IF EXISTS "requester cancels own" ON public.vehicle_requests;

CREATE POLICY "requester cancels own"
ON public.vehicle_requests
FOR UPDATE
TO authenticated
USING (requester_id = auth.uid() AND status IN ('pending'::request_status, 'approved'::request_status))
WITH CHECK (requester_id = auth.uid() AND status = 'cancelled'::request_status);