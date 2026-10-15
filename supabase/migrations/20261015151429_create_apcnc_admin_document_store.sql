create table public.apcnc_document_store (
  id smallint primary key default 1 check (id = 1),
  payload jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

create table public.apcnc_document_audit (
  id bigint generated always as identity primary key,
  revision bigint not null,
  payload jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) on delete set null
);

create index apcnc_document_audit_changed_at_idx
  on public.apcnc_document_audit (changed_at desc);

alter table public.apcnc_document_store enable row level security;
alter table public.apcnc_document_store force row level security;
alter table public.apcnc_document_audit enable row level security;
alter table public.apcnc_document_audit force row level security;

create policy "admins read APCNC document store"
  on public.apcnc_document_store
  for select
  to authenticated
  using ((select public.ap_is_admin()));

create policy "admins update APCNC document store"
  on public.apcnc_document_store
  for update
  to authenticated
  using ((select public.ap_is_admin()))
  with check ((select public.ap_is_admin()));

create policy "admins read APCNC document audit"
  on public.apcnc_document_audit
  for select
  to authenticated
  using ((select public.ap_is_admin()));

grant select, update on table public.apcnc_document_store to authenticated;
grant select on table public.apcnc_document_audit to authenticated;
revoke all on table public.apcnc_document_store from anon;
revoke all on table public.apcnc_document_audit from anon;

create or replace function public.apcnc_validate_document_payload()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  document_count bigint;
  unique_id_count bigint;
  unique_number_count bigint;
begin
  if new.payload ->> 'app' <> 'APCNC'
     or coalesce(jsonb_typeof(new.payload -> 'history'), '') <> 'array'
     or coalesce(jsonb_typeof(new.payload -> 'customers'), '') <> 'array'
     or coalesce(jsonb_typeof(new.payload -> 'products'), '') <> 'array' then
    raise exception 'invalid APCNC payload' using errcode = '23514';
  end if;

  select count(*),
         count(distinct item ->> 'id'),
         count(distinct item ->> 'number')
    into document_count, unique_id_count, unique_number_count
  from jsonb_array_elements(new.payload -> 'history') as item;

  if document_count <> unique_id_count then
    raise exception 'duplicate APCNC document id' using errcode = '23505';
  end if;
  if document_count <> unique_number_count then
    raise exception 'duplicate APCNC document number' using errcode = '23505';
  end if;
  return new;
end;
$$;

revoke all on function public.apcnc_validate_document_payload() from public, anon, authenticated;

create trigger apcnc_validate_document_store
before insert or update of payload on public.apcnc_document_store
for each row execute function public.apcnc_validate_document_payload();

create or replace function public.apcnc_audit_document_store()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.apcnc_document_audit (revision, payload, changed_by)
  values (new.revision, new.payload, (select auth.uid()));
  return new;
end;
$$;

revoke all on function public.apcnc_audit_document_store() from public, anon, authenticated;

create trigger apcnc_audit_document_store
after insert or update on public.apcnc_document_store
for each row execute function public.apcnc_audit_document_store();

create or replace function public.apcnc_save_document_store(
  p_payload jsonb,
  p_expected_revision bigint
)
returns table (revision bigint, saved_at timestamptz)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not (select public.ap_is_admin()) then
    raise exception 'admin access required' using errcode = '42501';
  end if;

  update public.apcnc_document_store as store
     set payload = p_payload,
         revision = store.revision + 1,
         updated_at = now(),
         updated_by = (select auth.uid())
   where store.id = 1
     and store.revision = p_expected_revision
  returning store.revision, store.updated_at
       into revision, saved_at;

  if not found then
    raise exception 'APCNC document data changed; reload and retry'
      using errcode = '40001';
  end if;

  return next;
end;
$$;

revoke all on function public.apcnc_save_document_store(jsonb, bigint) from public, anon;
grant execute on function public.apcnc_save_document_store(jsonb, bigint) to authenticated;

insert into public.apcnc_document_store (id, payload, revision)
values (
  1,
  '{"app":"APCNC","version":3,"savedAt":null,"profile":{},"numbering":{},"customers":[],"products":[],"history":[],"deletedHistory":{}}'::jsonb,
  1
);
