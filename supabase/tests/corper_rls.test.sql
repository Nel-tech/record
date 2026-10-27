begin;

select plan(15);

insert into public.lgas (id, name, state_name) values
  ('00000000-0000-0000-0000-000000000001', 'RLS Test LGA', 'Test State'),
  ('00000000-0000-0000-0000-000000000002', 'Other Test LGA', 'Test State')
on conflict (id) do nothing;

insert into public.cds_groups (id, name, lga_id) values
  ('00000000-0000-0000-0000-000000000011', 'Test Group One', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000012', 'Test Group Two', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000013', 'Other LGA Group', '00000000-0000-0000-0000-000000000002')
on conflict (id) do nothing;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000021', 'authenticated', 'authenticated', 'clo-rls@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000022', 'authenticated', 'authenticated', 'president-one@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000023', 'authenticated', 'authenticated', 'president-two@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000024', 'authenticated', 'authenticated', 'president-pending@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, email, role, lga_id, cds_group_id, approved) values
  ('00000000-0000-0000-0000-000000000021', 'clo-rls@example.test', 'clo', '00000000-0000-0000-0000-000000000001', null, true),
  ('00000000-0000-0000-0000-000000000022', 'president-one@example.test', 'president', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', true),
  ('00000000-0000-0000-0000-000000000023', 'president-two@example.test', 'president', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', true),
  ('00000000-0000-0000-0000-000000000024', 'president-pending@example.test', 'president', '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', false)
on conflict (id) do update set approved = excluded.approved;

insert into public.corpers
  (id, full_name, state_code, cds_group_id, lga_id, batch, year, created_by)
values
  ('00000000-0000-0000-0000-000000000031', 'Fictional One', 'TS/26B/9001', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'B1', 2026, '00000000-0000-0000-0000-000000000021'),
  ('00000000-0000-0000-0000-000000000032', 'Fictional Two', 'TS/26B/9002', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'B1', 2026, '00000000-0000-0000-0000-000000000021'),
  ('00000000-0000-0000-0000-000000000033', 'Fictional Three', 'OS/26B/9003', '00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000002', 'B1', 2026, '00000000-0000-0000-0000-000000000021')
on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000021', true);
select is((select count(*)::int from public.corpers), 2, 'CLO sees every corper in the CLO LGA only');
select lives_ok($$update public.corpers set ppa = 'Updated fictional PPA' where state_code = 'TS/26B/9001'$$,
  'CLO can update a corper in the CLO LGA');
select lives_ok($$insert into public.corpers (full_name, state_code, cds_group_id, lga_id, batch, year, created_by)
  values ('CLO Added', 'TS/26B/9006', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'B1', 2026, auth.uid())$$,
  'CLO can insert a corper in the CLO LGA');
select lives_ok($$delete from public.corpers where state_code = 'TS/26B/9006'$$,
  'CLO can delete a corper in the CLO LGA');
select throws_ok($$insert into public.corpers (full_name, state_code, cds_group_id, lga_id, batch, year, created_by)
  values ('Out of LGA', 'OS/26B/9007', '00000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000002', 'B1', 2026, auth.uid())$$,
  '42501', null, 'CLO cannot insert a corper outside the CLO LGA');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000022', true);
select is((select count(*)::int from public.corpers), 1, 'President sees only their own CDS group');
select lives_ok($$update public.corpers set ppa = 'President updated PPA'
  where state_code = 'TS/26B/9001'$$, 'President can update a corper in their CDS group');
select lives_ok($$insert into public.corpers (full_name, state_code, cds_group_id, lga_id, batch, year, created_by)
  values ('Fictional Added', 'TS/26B/9004', '00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'B1', 2026, auth.uid())$$,
  'President can insert into their CDS group');
select throws_ok($$insert into public.corpers (full_name, state_code, cds_group_id, lga_id, batch, year, created_by)
  values ('Out of Scope', 'TS/26B/9005', '00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'B1', 2026, auth.uid())$$,
  '42501', null, 'President cannot insert into another CDS group');
select throws_ok($$update public.corpers set cds_group_id = '00000000-0000-0000-0000-000000000012'
  where id = '00000000-0000-0000-0000-000000000031'$$,
  '42501', null, 'President cannot move a corper outside their CDS group');
delete from public.corpers where id = '00000000-0000-0000-0000-000000000031';
select is((select count(*)::int from public.corpers), 2, 'President cannot delete corpers');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000023', true);
select is((select count(*)::int from public.corpers), 1, 'Second president sees only the second CDS group');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000024', true);
select is((select count(*)::int from public.corpers), 0, 'Unapproved president has no corper access');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000021', true);
select is((select count(*)::int from public.corpers), 3, 'CLO remains scoped to all three corpers in their LGA');

reset role;
set local role anon;
select throws_ok($$select count(*) from public.corpers$$, '42501', null,
  'Anonymous users cannot access corper records');

select * from finish();
rollback;
