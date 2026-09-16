ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS regional text;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_regional_check
  CHECK (regional IS NULL OR regional IN ('Curitiba','Ponta Grossa','Londrina','Maringá','Jacarezinho'));