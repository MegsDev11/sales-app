#!/usr/bin/env bash
# Projects visibility + edit-rights test suite. Run against a throwaway local Postgres.
run() { psql -h /tmp -p 5433 -U postgres -tAX -c "$1" 2>&1 | tr -d ' \n'; }
as_user() {
  psql -h /tmp -p 5433 -U postgres -tAX 2>&1 <<EOF | tail -1 | tr -d ' '
set role authenticated;
select set_config('request.jwt.claim.sub', '$1', false);
$2
EOF
}
chk() { if [ "$2" = "$3" ]; then printf "  PASS  %-56s -> %s\n" "$1" "$2"
        else printf "  FAIL  %-56s -> got '%s' want '%s'\n" "$1" "$2" "$3"; echo F >> /tmp/pfail; fi }
rm -f /tmp/pfail

OWNER=11111111-1111-1111-1111-111111111111
SALES=22222222-2222-2222-2222-222222222222   # staff
FIN=33333333-3333-3333-3333-333333333333     # manager
STOCK=44444444-4444-4444-4444-444444444444   # staff

# Reset to a known state so the suite is re-runnable.
psql -h /tmp -p 5433 -U postgres -q >/dev/null 2>&1 <<RESET
delete from project_costs; delete from project_links; delete from project_tasks;
delete from project_members; delete from project_departments; delete from projects;
delete from user_module_access where module_key = 'projects';
insert into user_module_access (user_id, module_key, level) values
 ('$SALES','projects','edit'), ('$FIN','projects','manage'), ('$STOCK','projects','edit');
insert into projects (id, code, name, type, status, owner_id, created_by, is_private) values
 ('p-open',   'PRJ-0001','Modimolle tower upgrade','infrastructure','active','$STOCK','$STOCK',false),
 ('p-private','PRJ-0002','Restructure plan',       'internal',      'idea',  '$FIN',  '$FIN',  true),
 ('p-idea',   'PRJ-0003','Prepaid wifi vouchers',  'business_idea', 'idea',  '$SALES','$SALES',false);
insert into project_members (project_id,user_id,role) values
 ('p-open','$STOCK','lead'), ('p-open','$SALES','contributor');
insert into project_tasks (id,project_id,title,status,assignee_id) values
 ('t-1','p-open','Order mounting hardware','todo','$SALES');
RESET

echo "== Non-private projects: visible to anyone with the module =="
chk "owner sees open project"          "$(as_user $OWNER "select count(*) from projects where id='p-open';")" "1"
chk "member sees open project"         "$(as_user $SALES "select count(*) from projects where id='p-open';")" "1"
chk "non-member with module sees it"   "$(as_user $FIN   "select count(*) from projects where id='p-open';")" "1"

echo
echo "== Private projects: members only =="
chk "creator sees own private project" "$(as_user $FIN   "select count(*) from projects where id='p-private';")" "1"
chk "non-member CANNOT see it"         "$(as_user $SALES "select count(*) from projects where id='p-private';")" "0"
chk "stock staff CANNOT see it"        "$(as_user $STOCK "select count(*) from projects where id='p-private';")" "0"
run "insert into project_members (project_id,user_id,role) values ('p-private','$SALES','viewer');" >/dev/null
chk "added as member -> now visible"   "$(as_user $SALES "select count(*) from projects where id='p-private';")" "1"
run "delete from project_members where project_id='p-private' and user_id='$SALES';" >/dev/null
chk "removed -> hidden again"          "$(as_user $SALES "select count(*) from projects where id='p-private';")" "0"

echo
echo "== Revoking the module removes access entirely =="
run "delete from user_module_access where user_id='$SALES' and module_key='projects';" >/dev/null
chk "no module grant -> sees nothing"  "$(as_user $SALES "select count(*) from projects;")" "0"
run "insert into user_module_access (user_id,module_key,level) values ('$SALES','projects','edit');" >/dev/null
chk "regranted -> sees open + idea"    "$(as_user $SALES "select count(*) from projects;")" "2"

echo
echo "== Edit rights: owner, project lead, or module manager =="
chk "project lead can rename"          "$(as_user $STOCK "update projects set name='Tower upgrade v2' where id='p-open'; select name from projects where id='p-open';")" "Towerupgradev2"
as_user $SALES "update projects set name='HIJACKED' where id='p-open';" >/dev/null
chk "contributor CANNOT rename"        "$(run "select name from projects where id='p-open';")" "Towerupgradev2"
chk "projects:manage can rename any"   "$(as_user $FIN "update projects set priority='high' where id='p-open'; select priority from projects where id='p-open';")" "high"

echo
echo "== Task assignees can progress their own work =="
chk "assignee updates own task"        "$(as_user $SALES "update project_tasks set status='in_progress' where id='t-1'; select status from project_tasks where id='t-1';")" "in_progress"
run "insert into project_tasks (id,project_id,title,assignee_id) values ('t-2','p-open','Schedule crane','$STOCK');" >/dev/null
as_user $SALES "update project_tasks set status='done' where id='t-2';" >/dev/null
chk "cannot complete someone else's"   "$(run "select status from project_tasks where id='t-2';")" "todo"

echo
echo "== Costs roll up to the project automatically =="
run "insert into project_costs (id,project_id,description,amount) values ('c-1','p-open','Mounting kit',4500);" >/dev/null
run "insert into project_costs (id,project_id,description,amount) values ('c-2','p-open','Crane hire',12000);" >/dev/null
chk "actual_cost after 2 costs"        "$(run "select actual_cost from projects where id='p-open';")" "16500.00"
run "delete from project_costs where id='c-2';" >/dev/null
chk "actual_cost after deleting one"   "$(run "select actual_cost from projects where id='p-open';")" "4500.00"

echo
echo "== Cross-module links =="
run "insert into project_links (id,project_id,entity_type,entity_id,label) values ('l-1','p-open','lead','lead-1','Acme Farm');" >/dev/null
chk "link visible to project members"  "$(as_user $STOCK "select count(*) from project_links where project_id='p-open';")" "1"
chk "reverse lookup by entity works"   "$(as_user $STOCK "select count(*) from project_links where entity_type='lead' and entity_id='lead-1';")" "1"

echo
echo "== Project codes are unique and sequential =="
chk "next_project_code format"         "$(run "select public.next_project_code() ~ '^PRJ-[0-9]{4}$';")" "t"
chk "codes do not repeat"              "$(run "select public.next_project_code() <> public.next_project_code();")" "t"

echo
[ -f /tmp/pfail ] && { echo "PROJECTS TESTS FAILED"; exit 1; } || echo "ALL PROJECTS TESTS PASSED"
