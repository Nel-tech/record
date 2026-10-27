create or replace function public.register_initial_clo(
  target_user_id uuid,
  target_email text,
  target_lga_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('public.register_initial_clo', 0));

  if exists (select 1 from public.profiles where role = 'clo') then
    raise exception 'A CLO account already exists';
  end if;

  insert into public.profiles (id, email, role, lga_id, cds_group_id, approved)
  values (target_user_id, target_email, 'clo', target_lga_id, null, true);
end;
$$;

revoke all on function public.register_initial_clo(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.register_initial_clo(uuid, text, uuid) to service_role;
