create table if not exists public.ai_video_settings (
  id text primary key default 'default' check (id = 'default'),
  budget_limit_thb numeric(12,2) not null default 130.00 check (budget_limit_thb >= 0),
  usd_thb_rate numeric(10,4) not null default 37.0000 check (usd_thb_rate > 0),
  max_concurrent_jobs integer not null default 1 check (max_concurrent_jobs between 1 and 10),
  confirmation_ttl_minutes integer not null default 10 check (confirmation_ttl_minutes between 1 and 60),
  updated_at timestamptz not null default now()
);

insert into public.ai_video_settings (id)
values ('default')
on conflict (id) do nothing;

create table if not exists public.ai_video_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 128),
  status text not null default 'estimated'
    check (status in ('estimated','submitting','submitted','running','succeeded','failed','unknown','cancelled')),
  model text not null,
  duration_seconds integer not null check (duration_seconds in (4,6,8)),
  aspect_ratio text not null check (aspect_ratio in ('9:16','16:9')),
  resolution text not null check (resolution in ('720p','1080p','4k')),
  has_start_frame boolean not null default true,
  has_end_frame boolean not null default false,
  prompt_sha256 text not null check (char_length(prompt_sha256) = 64),
  request_summary jsonb not null default '{}'::jsonb,
  estimated_cost_usd numeric(12,4) not null check (estimated_cost_usd >= 0),
  estimated_cost_thb numeric(12,2) not null check (estimated_cost_thb >= 0),
  confirmation_token_hash text check (confirmation_token_hash is null or char_length(confirmation_token_hash) = 64),
  confirmation_expires_at timestamptz,
  confirmed_at timestamptz,
  google_operation_name text,
  google_response_summary jsonb,
  video_uri text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  last_checked_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index if not exists ai_video_jobs_user_created_idx
  on public.ai_video_jobs (user_id, created_at desc);
create index if not exists ai_video_jobs_active_status_idx
  on public.ai_video_jobs (status, created_at)
  where status in ('submitting','submitted','running','unknown');

alter table public.ai_video_settings enable row level security;
alter table public.ai_video_jobs enable row level security;

revoke all on public.ai_video_settings from anon;
revoke all on public.ai_video_jobs from anon;
grant select on public.ai_video_settings to authenticated;
grant select, insert, update on public.ai_video_jobs to authenticated;

drop policy if exists "Admins can read AI video settings" on public.ai_video_settings;
create policy "Admins can read AI video settings"
on public.ai_video_settings for select
to authenticated
using (public.is_admin());

drop policy if exists "Owners and admins can read AI video jobs" on public.ai_video_jobs;
create policy "Owners and admins can read AI video jobs"
on public.ai_video_jobs for select
to authenticated
using ((select auth.uid()) = user_id or public.is_admin());

drop policy if exists "Owners and admins can create AI video jobs" on public.ai_video_jobs;
create policy "Owners and admins can create AI video jobs"
on public.ai_video_jobs for insert
to authenticated
with check (((select auth.uid()) = user_id) and public.is_admin());

drop policy if exists "Owners and admins can update AI video jobs" on public.ai_video_jobs;
create policy "Owners and admins can update AI video jobs"
on public.ai_video_jobs for update
to authenticated
using (((select auth.uid()) = user_id) and public.is_admin())
with check (((select auth.uid()) = user_id) and public.is_admin());

comment on table public.ai_video_jobs is
  'Server-side audit and idempotency records for explicitly confirmed Google Veo jobs.';
comment on column public.ai_video_jobs.request_summary is
  'Non-secret metadata only. Never store image base64, access tokens, refresh tokens, or API keys.';
