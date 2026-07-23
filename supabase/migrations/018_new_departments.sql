-- Add wireless, fiber, financial, general, accounts, and reception departments.

alter table public.team_members drop constraint if exists team_members_department_check;
alter table public.team_members
  add constraint team_members_department_check
  check (
    department is null
    or department in (
      'sales',
      'stock',
      'coordination',
      'support',
      'wireless',
      'fiber',
      'financial',
      'general',
      'accounts',
      'reception'
    )
  );

alter table public.app_notifications drop constraint if exists app_notifications_department_check;
alter table public.app_notifications
  add constraint app_notifications_department_check
  check (
    department is null
    or department in (
      'sales',
      'stock',
      'coordination',
      'support',
      'wireless',
      'fiber',
      'financial',
      'general',
      'accounts',
      'reception'
    )
  );
