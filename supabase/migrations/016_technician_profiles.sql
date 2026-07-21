-- Additional profile details for field technicians.

alter table public.team_members
  add column if not exists technician_level text
    check (technician_level is null or technician_level in ('junior', 'senior')),
  add column if not exists phone text,
  add column if not exists id_number text;
