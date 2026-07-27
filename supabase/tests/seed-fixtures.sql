-- Realistic users covering the scenario Wesley described
insert into public.team_members (id, name, email, auth_user_id, role, department, color, avatar_initials, title, monthly_revenue_target, monthly_deals_target, active) values
 ('11111111-1111-1111-1111-111111111111','Wesley Owner','owner@megs.co.za','11111111-1111-1111-1111-111111111111','owner',null,      '#000','WO','Megs Owner',0,0,true),
 ('22222222-2222-2222-2222-222222222222','Sipho Sales','sipho@megs.co.za','22222222-2222-2222-2222-222222222222','staff','sales',     '#111','SS','Sales Rep',100000,5,true),
 ('33333333-3333-3333-3333-333333333333','Thandi Finance','thandi@megs.co.za','33333333-3333-3333-3333-333333333333','manager','financial','#222','TF','Finance Manager',0,0,true),
 ('44444444-4444-4444-4444-444444444444','Johan Stock','johan@megs.co.za','44444444-4444-4444-4444-444444444444','staff','stock',   '#333','JS','Stock Controller',0,0,true);

-- Business data to probe
insert into public.leads (id, client_name, phone, email, service_type, package_tier, stage, coverage_status, service_zone, temperature)
values ('lead-1','Acme Farm','0821234567','acme@x.co.za','wireless','Premium','new_lead','confirmed','Modimolle','hot');

insert into public.stock_products (id, name, sku, brand_default, notes) values ('prod-1','Ruijie AX3000','RJ-AX3000','Ruijie','');
insert into public.stock_items (id, product_id, qr_token, brand, device_name, serial_number, client_name, client_address, client_pppoe, wifi_name, wifi_password, status)
values ('item-1','prod-1','tok-abc','Ruijie','AX3000','SN123','Acme Farm','Plot 42, Modimolle','acme@pppoe','AcmeWiFi','SuperSecret123','available');
