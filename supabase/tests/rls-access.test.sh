run() { psql -h /tmp -p 5433 -U postgres -tAX -c "$1" 2>&1 | tr -d ' \n'; }
as_user() { # $1 = uuid, $2 = query
  psql -h /tmp -p 5433 -U postgres -tAX 2>&1 <<EOF | tail -1 | tr -d ' '
set role authenticated;
select set_config('request.jwt.claim.sub', '$1', false);
$2
EOF
}
as_anon() {
  psql -h /tmp -p 5433 -U postgres -tAX 2>&1 <<EOF | tail -1 | tr -d ' '
set role anon;
$1
EOF
}
chk() { # name, actual, expected
  if [ "$2" = "$3" ]; then printf "  PASS  %-58s -> %s\n" "$1" "$2"
  else printf "  FAIL  %-58s -> got '%s' want '%s'\n" "$1" "$2" "$3"; echo FAILED >> /tmp/failures; fi
}
rm -f /tmp/failures

# Reset to a known state so the suite is re-runnable rather than order-dependent.
psql -h /tmp -p 5433 -U postgres -q >/dev/null 2>&1 <<'RESET'
delete from user_module_access;
update team_members set template_id = null, role = case when id='11111111-1111-1111-1111-111111111111' then 'owner' when id='33333333-3333-3333-3333-333333333333' then 'manager' else 'staff' end;
update stock_items set brand='Ruijie' where id='item-1';
RESET
psql -h /tmp -p 5433 -U postgres -q -f "$(dirname "$0")/../migrations/041_backfill_module_access.sql" >/dev/null 2>&1   || psql -h /tmp -p 5433 -U postgres -q -f /home/claude/salesapp/supabase/migrations/041_backfill_module_access.sql >/dev/null 2>&1

OWNER=11111111-1111-1111-1111-111111111111
SALES=22222222-2222-2222-2222-222222222222
FIN=33333333-3333-3333-3333-333333333333
STOCK=44444444-4444-4444-4444-444444444444

echo "== F1a: anonymous visitor (the public bundle key) =="
chk "anon reads leads"                "$(as_anon 'select count(*) from leads;')"        "ERROR:permissiondeniedfortableleads"
chk "anon reads stock_items"          "$(as_anon 'select count(*) from stock_items;')"  "ERROR:permissiondeniedfortablestock_items"
chk "anon reads team_members"         "$(as_anon 'select count(*) from team_members;')" "ERROR:permissiondeniedfortableteam_members"

echo
echo "== Sales rep: has crm, no stock =="
chk "sales rep reads leads"           "$(as_user $SALES 'select count(*) from leads;')"       "1"
chk "sales rep reads stock_items"     "$(as_user $SALES 'select count(*) from stock_items;')" "0"
chk "sales rep reads wifi_password"   "$(as_user $SALES "select count(*) from stock_items where wifi_password='SuperSecret123';")" "0"

echo
echo "== Finance manager: financial only, no CRM, no stock =="
chk "finance reads leads"             "$(as_user $FIN 'select count(*) from leads;')"       "0"
chk "finance reads stock_items"       "$(as_user $FIN 'select count(*) from stock_items;')" "0"

echo
echo "== F1b: privilege escalation =="
esc=$(psql -h /tmp -p 5433 -U postgres -tAX 2>&1 <<EOF
set role authenticated;
select set_config('request.jwt.claim.sub','$SALES',false);
update team_members set role='owner' where id='$SALES';
EOF
)
chk "sales rep self-promotes to owner" "$(echo "$esc" | grep -qF 'Only an owner may change role' && echo BLOCKED || echo ALLOWED)" "BLOCKED"
chk "role unchanged after attempt"     "$(run "select role from team_members where id='$SALES';")" "staff"

echo
echo "== Owner break-glass =="
chk "owner reads leads"               "$(as_user $OWNER 'select count(*) from leads;')"       "1"
chk "owner reads stock_items"         "$(as_user $OWNER 'select count(*) from stock_items;')" "1"

echo
echo "== THE HEADLINE FEATURE: grant Finance access to Wireless/Stock by ticking a box =="
chk "before grant, finance sees stock" "$(as_user $FIN 'select count(*) from stock_items;')" "0"
run "insert into user_module_access (user_id, module_key, level) values ('$FIN','stock','view');" >/dev/null
chk "after  grant, finance sees stock" "$(as_user $FIN 'select count(*) from stock_items;')" "1"
as_user $FIN "update stock_items set brand='HACKED' where id='item-1';" >/dev/null
chk "view-only grant cannot write"     "$(run "select brand from stock_items where id='item-1';")" "Ruijie"
run "update user_module_access set level='edit' where user_id='$FIN' and module_key='stock';" >/dev/null
chk "raised to edit, now can write"    "$(as_user $FIN "update stock_items set brand='X' where id='item-1'; select brand from stock_items where id='item-1';")" "X"
run "delete from user_module_access where user_id='$FIN' and module_key='stock';" >/dev/null
chk "revoked, access gone again"       "$(as_user $FIN 'select count(*) from stock_items;')" "0"

echo
echo "== Expiring grants =="
run "insert into user_module_access (user_id, module_key, level, expires_at) values ('$FIN','crm','view', now() - interval '1 day');" >/dev/null
chk "expired grant denies access"      "$(as_user $FIN 'select count(*) from leads;')" "0"
run "update user_module_access set expires_at = now() + interval '1 day' where user_id='$FIN' and module_key='crm';" >/dev/null
chk "unexpired grant allows access"    "$(as_user $FIN 'select count(*) from leads;')" "1"

echo
echo "== Templates =="
run "update team_members set template_id='tpl_support_agent' where id='$FIN'; delete from user_module_access where user_id='$FIN';" >/dev/null
chk "template grants support"          "$(as_user $FIN "select public.has_module_access('support','edit')::text;")" "true"
run "insert into user_module_access (user_id, module_key, level) values ('$FIN','support','none');" >/dev/null
chk "direct 'none' overrides template" "$(as_user $FIN "select public.has_module_access('support','view')::text;")" "false"

echo
echo "== Timesheet self-access =="
run "insert into jobs (id,title,status) values ('job-1','Install',(select 'scheduled'));" >/dev/null 2>&1
run "insert into time_entries (id,technician_id,clock_in_at) values ('te-1','$STOCK',now());" >/dev/null
chk "tech sees own time entry"        "$(as_user $STOCK 'select count(*) from time_entries;')" "1"
chk "sales rep cannot see it"         "$(as_user $SALES 'select count(*) from time_entries;')" "0"

echo
[ -f /tmp/failures ] && { echo "SOME TESTS FAILED"; exit 1; } || echo "ALL SECURITY TESTS PASSED"
