create extension if not exists pgcrypto;

create table if not exists public.lgas (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  state_name text not null default 'Demo State',
  unique (name, state_name)
);

create table if not exists public.cds_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  lga_id uuid not null references public.lgas(id) on delete cascade,
  unique (name, lga_id),
  unique (id, lga_id)
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null check (role in ('clo', 'president')),
  lga_id uuid not null references public.lgas(id),
  cds_group_id uuid,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  constraint profile_group_lga_fk foreign key (cds_group_id, lga_id)
    references public.cds_groups(id, lga_id),
  constraint president_group_required check (role <> 'president' or cds_group_id is not null),
  constraint clo_group_empty check (role <> 'clo' or cds_group_id is null)
);

create table if not exists public.corpers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  state_code text not null unique check (state_code ~ '^[A-Z]{2}/[0-9]{2}[ABC]/[0-9]{4}$'),
  call_up_no text,
  phone text,
  address text,
  discipline text,
  ppa text,
  dob date,
  bank_name text,
  account_no text,
  cds_group_id uuid not null,
  lga_id uuid not null,
  batch text not null check (batch in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  year integer not null check (year between 2000 and 2099),
  photo_url text,
  status text not null default 'serving' check (status in ('serving', 'passed_out')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint corper_group_lga_fk foreign key (cds_group_id, lga_id)
    references public.cds_groups(id, lga_id),
  constraint corper_batch_year_derived check (
    batch = substring(state_code from 6 for 1) || right(batch, 1)
    and year = 2000 + substring(state_code from 4 for 2)::integer
  )
);

create index if not exists corpers_lga_group_idx on public.corpers (lga_id, cds_group_id);
create index if not exists corpers_year_batch_idx on public.corpers (year, batch);

alter table public.lgas enable row level security;
alter table public.cds_groups enable row level security;
alter table public.profiles enable row level security;
alter table public.corpers enable row level security;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

create or replace function public.my_lga_id()
returns uuid language sql stable security definer set search_path = public
as $$ select lga_id from public.profiles where id = auth.uid() $$;

create or replace function public.my_cds_group_id()
returns uuid language sql stable security definer set search_path = public
as $$ select cds_group_id from public.profiles where id = auth.uid() $$;

create or replace function public.is_approved()
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select approved from public.profiles where id = auth.uid()), false) $$;

create or replace function public.approve_president(target_profile uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if public.my_role() <> 'clo' or not public.is_approved() then
    raise exception 'Only an approved CLO can approve presidents';
  end if;
  update public.profiles
  set approved = true
  where id = target_profile
    and role = 'president'
    and lga_id = public.my_lga_id()
    and approved = false;
  if not found then
    raise exception 'Pending president was not found in your LGA';
  end if;
end;
$$;

create or replace function public.create_president_profile()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  requested_lga uuid;
  requested_group uuid;
begin
  if coalesce(new.raw_user_meta_data ->> 'role', '') <> 'president' then
    return new;
  end if;
  requested_lga := (new.raw_user_meta_data ->> 'lga_id')::uuid;
  requested_group := (new.raw_user_meta_data ->> 'cds_group_id')::uuid;
  insert into public.profiles (id, email, role, lga_id, cds_group_id, approved)
  values (new.id, new.email, 'president', requested_lga, requested_group, false);
  return new;
end;
$$;

create or replace function public.sync_profile_email()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_email_updated on auth.users;
create trigger on_auth_email_updated
  after update of email on auth.users
  for each row execute procedure public.sync_profile_email();

drop trigger if exists on_auth_user_created_president on auth.users;
create trigger on_auth_user_created_president
  after insert on auth.users
  for each row execute procedure public.create_president_profile();

create table if not exists public.scan_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null default 0
);
alter table public.scan_rate_limits enable row level security;

create or replace function public.consume_scan_rate_limit()
returns boolean language plpgsql security definer set search_path = public
as $$
declare
  scan_count integer;
begin
  if auth.uid() is null or public.my_role() <> 'clo' or not public.is_approved() then
    raise exception 'Only an approved CLO can scan register photos';
  end if;
  insert into public.scan_rate_limits (user_id, window_started_at, request_count)
  values (auth.uid(), date_trunc('minute', now()), 1)
  on conflict (user_id) do update
    set window_started_at = case
          when public.scan_rate_limits.window_started_at < date_trunc('minute', now())
          then date_trunc('minute', now())
          else public.scan_rate_limits.window_started_at end,
        request_count = case
          when public.scan_rate_limits.window_started_at < date_trunc('minute', now())
          then 1 else public.scan_rate_limits.request_count + 1 end
  returning request_count into scan_count;
  return scan_count <= 5;
end;
$$;

create policy "Authenticated users can read LGA options"
  on public.lgas for select to authenticated using (true);
create policy "Authenticated users can read CDS groups"
  on public.cds_groups for select to authenticated using (true);

create policy "Users can read own profile; CLOs can read their LGA"
  on public.profiles for select to authenticated
  using (id = auth.uid() or (public.my_role() = 'clo' and lga_id = public.my_lga_id()));
create policy "Presidents can request access"
  on public.profiles for insert to authenticated
  with check (id = auth.uid() and role = 'president' and approved = false);
create policy "CLOs can read all corpers in their LGA"
  on public.corpers for select to authenticated
  using (public.is_approved() and public.my_role() = 'clo' and lga_id = public.my_lga_id());
create policy "CLOs can add corpers in their LGA"
  on public.corpers for insert to authenticated
  with check (public.is_approved() and public.my_role() = 'clo'
    and lga_id = public.my_lga_id() and created_by = auth.uid());
create policy "CLOs can edit corpers in their LGA"
  on public.corpers for update to authenticated
  using (public.is_approved() and public.my_role() = 'clo' and lga_id = public.my_lga_id())
  with check (public.is_approved() and public.my_role() = 'clo' and lga_id = public.my_lga_id());
create policy "CLOs can delete corpers in their LGA"
  on public.corpers for delete to authenticated
  using (public.is_approved() and public.my_role() = 'clo' and lga_id = public.my_lga_id());

create policy "Approved presidents can read their CDS group"
  on public.corpers for select to authenticated
  using (public.is_approved() and public.my_role() = 'president'
    and lga_id = public.my_lga_id() and cds_group_id = public.my_cds_group_id());
create policy "Approved presidents can add to their CDS group"
  on public.corpers for insert to authenticated
  with check (public.is_approved() and public.my_role() = 'president'
    and lga_id = public.my_lga_id() and cds_group_id = public.my_cds_group_id()
    and created_by = auth.uid());
create policy "Approved presidents can edit their CDS group"
  on public.corpers for update to authenticated
  using (public.is_approved() and public.my_role() = 'president'
    and lga_id = public.my_lga_id() and cds_group_id = public.my_cds_group_id())
  with check (public.is_approved() and public.my_role() = 'president'
    and lga_id = public.my_lga_id() and cds_group_id = public.my_cds_group_id());

revoke all on function public.approve_president(uuid) from public, anon;
grant execute on function public.approve_president(uuid) to authenticated;
revoke all on function public.consume_scan_rate_limit() from public, anon;
grant execute on function public.consume_scan_rate_limit() to authenticated;
revoke all on function public.my_role() from public, anon;
revoke all on function public.my_lga_id() from public, anon;
revoke all on function public.my_cds_group_id() from public, anon;
revoke all on function public.is_approved() from public, anon;
grant execute on function public.my_role() to authenticated;
grant execute on function public.my_lga_id() to authenticated;
grant execute on function public.my_cds_group_id() to authenticated;
grant execute on function public.is_approved() to authenticated;

grant select on public.lgas, public.cds_groups to authenticated;
grant select, insert on public.profiles to authenticated;
grant select, insert, update, delete on public.corpers to authenticated;
revoke all on public.profiles, public.corpers from anon;

insert into public.lgas (name, state_name)
values ('Central LGA', 'Demo State')
on conflict (name, state_name) do nothing;

insert into public.cds_groups (name, lga_id)
select group_name, lga.id
from public.lgas lga
cross join (values ('Community Development'), ('Environmental Sanitation')) groups(group_name)
where lga.name = 'Central LGA' and lga.state_name = 'Demo State'
on conflict (name, lga_id) do nothing;
