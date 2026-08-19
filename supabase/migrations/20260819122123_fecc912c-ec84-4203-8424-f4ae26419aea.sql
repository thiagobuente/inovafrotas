ALTER TABLE public.trip_logs ADD COLUMN IF NOT EXISTS photo_paths text[] NOT NULL DEFAULT '{}';

CREATE POLICY "diario upload own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'diario-bordo' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "diario read own or manager"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'diario-bordo' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'manager')));

CREATE POLICY "diario delete own"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'diario-bordo' AND (storage.foldername(name))[1] = auth.uid()::text);