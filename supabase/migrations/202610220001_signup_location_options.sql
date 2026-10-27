create policy "Anyone can read signup location options"
  on public.lgas for select to anon, authenticated using (true);
create policy "Anyone can read signup CDS group options"
  on public.cds_groups for select to anon, authenticated using (true);

grant select on public.lgas, public.cds_groups to anon;

insert into public.lgas (name, state_name)
values ('Nsit-Ibom', 'Akwa Ibom')
on conflict (name, state_name) do nothing;

insert into public.cds_groups (name, lga_id)
select group_name, lga.id
from public.lgas lga
cross join (values
  ('Agro-Allied'),
  ('Anti-Corruption'),
  ('Medicals'),
  ('Sanitation'),
  ('SDG'),
  ('Education'),
  ('Gender and Charity'),
  ('Sports')
) groups(group_name)
where lga.name = 'Nsit-Ibom' and lga.state_name = 'Akwa Ibom'
on conflict (name, lga_id) do nothing;
