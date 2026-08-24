create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create table if not exists public.reminder_dispatches (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.vehicle_requests(id) on delete cascade,
  protocol text not null,
  kind text not null,
  created_at timestamptz not null default now(),
  unique (request_id, kind)
);

grant select on public.reminder_dispatches to authenticated;
grant all on public.reminder_dispatches to service_role;
alter table public.reminder_dispatches enable row level security;

create policy "managers read reminder dispatches"
  on public.reminder_dispatches for select to authenticated
  using (public.has_role(auth.uid(), 'manager'::app_role));

create table if not exists public.automation_settings (
  id boolean primary key default true check (id),
  cron_token text not null,
  updated_at timestamptz not null default now()
);

grant all on public.automation_settings to service_role;
alter table public.automation_settings enable row level security;

insert into public.automation_settings (id, cron_token)
values (true, 'wVSx6sJBnqUpqaJQUM4OJBablYQbY4')
on conflict (id) do nothing;

select cron.unschedule('seia-lembretes') where exists (
  select 1 from cron.job where jobname = 'seia-lembretes'
);

select cron.schedule(
  'seia-lembretes',
  '0 * * * *',
  $$
  select net.http_post(
    url := 'https://inovafrotas.lovable.app/api/public/lembretes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-seia-cron', (select cron_token from public.automation_settings where id)
    ),
    body := '{}'::jsonb
  );
  $$
);