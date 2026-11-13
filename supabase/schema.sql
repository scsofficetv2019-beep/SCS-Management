-- =====================================================================
--  SCS Management — Supabase database schema
--  Swarup Construction Solution
-- ---------------------------------------------------------------------
--  Supabase Dashboard > SQL Editor > New query > এই পুরো ফাইল পেস্ট > Run
--  ফাইলটি একাধিকবার Run করলেও সমস্যা নেই (idempotent)।
--
--  কাঠামো:
--   * profiles / app_access / apps  -> অ্যাকাউন্ট, অনুমোদন, কোন অ্যাপে কী রোল
--   * audit_log                      -> সব অ্যাপের লাইফটাইম অ্যাক্টিভিটি লগ
--                                       (ডাটাবেস ট্রিগার লেখে; এডিট কেউ পারে না, ডিলিট শুধু Super Admin)
--   * v2: profile = employee, profile_documents, sys_settings, app_pins,
--         notifications / push_subscriptions, password_reset_codes
--   * chem_*   -> SCS Chemical Order
--   * att_*    -> SCS Employee Attendance
--   * mr_*     -> SCS Monthly Report
--   * শেয়ার্ড ডাটা:
--       chem_orders          -> Chemical Order লেখে, Monthly Report শুধু পড়ে
--       att_monthly_summary  -> Attendance লেখে,     Monthly Report শুধু পড়ে
-- =====================================================================

create extension if not exists pgcrypto;

-- =====================================================================
--  1. CORE: apps, profiles, app_access
-- =====================================================================
create table if not exists public.apps (
  key         text primary key,
  name        text not null,
  name_bn     text,
  description text,
  path        text not null,
  icon        text default '📦',
  color       text default '#e91e63',
  sort_order  int  default 0,
  active      boolean not null default true
);

insert into public.apps (key, name, name_bn, description, path, icon, color, sort_order) values
  ('monthly-report', 'SCS Monthly Report',      'এসসিএস মান্থলি রিপোর্ট',   'Monthly sales, store, transport, salary & loan reports', '/apps/monthly-report/', '📊', '#7c3aed', 1),
  ('attendance',     'SCS Employee Attendance', 'এসসিএস এমপ্লয়ি অ্যাটেন্ডেন্স', 'GPS clock-in, leave record & monthly attendance',     '/apps/attendance/',     '🕘', '#e91e63', 2),
  ('chemical-order', 'SCS Chemical Order',      'এসসিএস কেমিক্যাল অর্ডার',  'Orders, bill & challan, SMS, products & sellers',      '/apps/chemical-order/', '🧪', '#db2777', 3)
on conflict (key) do update set
  name = excluded.name, name_bn = excluded.name_bn, description = excluded.description,
  path = excluded.path, icon = excluded.icon, color = excluded.color, sort_order = excluded.sort_order;

create table if not exists public.profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          text not null,
  full_name      text default '',
  phone          text default '',
  status         text not null default 'pending' check (status in ('pending','active','disabled')),
  is_super_admin boolean not null default false,
  approved_by    uuid,
  approved_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid
);

create table if not exists public.app_access (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  app_key    text not null references public.apps(key) on delete cascade on update cascade,
  role       text not null default 'user' check (role in ('user','admin')),
  granted_by uuid,
  granted_at timestamptz not null default now(),
  primary key (user_id, app_key)
);

-- নতুন সাইন-আপ -> profiles এ 'pending' রো
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', ''),
          coalesce(new.raw_user_meta_data->>'phone', ''))
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- permission helpers ----------
create or replace function public.is_super_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and is_super_admin and status = 'active');
$$;

-- p_role = 'user' -> user বা admin হলেই চলবে; 'admin' -> শুধু admin
create or replace function public.has_app(p_app text, p_role text default 'user') returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_super_admin() or exists (
    select 1 from public.app_access a
    join public.profiles p on p.id = a.user_id
    where a.user_id = auth.uid() and p.status = 'active' and a.app_key = p_app
      and (p_role = 'user' or a.role = 'admin'));
$$;

-- সাধারণ ইউজার নিজের status / super-admin ফ্ল্যাগ বদলাতে পারবে না
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then            -- SQL Editor / service role
    new.updated_at := now(); return new;
  end if;
  if not public.is_super_admin() then
    new.status := old.status;
    new.is_super_admin := old.is_super_admin;
    new.approved_by := old.approved_by;
    new.approved_at := old.approved_at;
    new.email := old.email;
  elsif new.status = 'active' and old.status <> 'active' then
    new.approved_by := auth.uid(); new.approved_at := now();
  end if;
  new.updated_at := now(); new.updated_by := auth.uid();
  return new;
end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.profiles_guard();

create or replace function public.app_access_stamp() returns trigger
language plpgsql as $$
begin
  new.granted_by := coalesce(auth.uid(), new.granted_by);
  new.granted_at := now();
  return new;
end $$;

drop trigger if exists app_access_stamp on public.app_access;
create trigger app_access_stamp before insert or update on public.app_access
  for each row execute function public.app_access_stamp();

-- =====================================================================
--  2. AUDIT LOG (lifetime activity history, ডাটাবেস নিজেই লেখে)
-- =====================================================================
create table if not exists public.audit_log (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  app_key        text not null,
  table_name     text not null,
  entity         text,
  record_ref     text,
  action         text not null,           -- Add / Edit / Delete
  old_data       jsonb,
  new_data       jsonb,
  changed_fields text[],
  actor_id       uuid,
  actor_email    text,
  actor_name     text
);
create index if not exists audit_log_app_at on public.audit_log (app_key, at desc);
create index if not exists audit_log_ref    on public.audit_log (app_key, record_ref);
create index if not exists audit_log_actor  on public.audit_log (actor_id, at desc);

-- TG_ARGV[0] = app_key, TG_ARGV[1] = entity label, TG_ARGV[2] = ref column
create or replace function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb; v_new jsonb; v_changed text[]; v_ref text;
  v_uid uuid := auth.uid(); v_email text; v_name text;
begin
  if tg_op in ('UPDATE','DELETE') then v_old := to_jsonb(old); end if;
  if tg_op in ('INSERT','UPDATE') then v_new := to_jsonb(new); end if;

  if tg_op = 'UPDATE' then
    select array_agg(k order by k) into v_changed from (
      select n.key as k from jsonb_each(v_new) n
       where n.key not in ('updated_at','updated_by') and (v_old -> n.key) is distinct from n.value
      union
      select o.key from jsonb_each(v_old) o where not (v_new ? o.key)
    ) s;
    if v_changed is null then return new; end if;   -- কিছুই বদলায়নি -> লগ নয়
  end if;

  v_ref := coalesce(v_new ->> tg_argv[2], v_old ->> tg_argv[2]);

  if v_uid is not null then
    select email, coalesce(nullif(full_name, ''), email) into v_email, v_name
      from public.profiles where id = v_uid;
  else
    v_name := 'System';
  end if;

  insert into public.audit_log (app_key, table_name, entity, record_ref, action,
                                old_data, new_data, changed_fields, actor_id, actor_email, actor_name)
  values (tg_argv[0], tg_table_name, tg_argv[1], v_ref,
          case tg_op when 'INSERT' then 'Add' when 'UPDATE' then 'Edit' else 'Delete' end,
          v_old, v_new, v_changed, v_uid, v_email, v_name);
  return coalesce(new, old);
end $$;

-- created_by / updated_by / updated_at স্বয়ংক্রিয়
create or replace function public.stamp_row() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := coalesce(new.created_at, now());
    new.created_by := coalesce(auth.uid(), new.created_by);
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- helper to attach both triggers
create or replace function public.scs_attach_triggers(p_table text, p_app text, p_entity text, p_ref text, p_stamp boolean default true)
returns void language plpgsql as $$
begin
  execute format('drop trigger if exists zz_audit on public.%I', p_table);
  execute format('create trigger zz_audit after insert or update or delete on public.%I for each row execute function public.audit_trigger(%L, %L, %L)', p_table, p_app, p_entity, p_ref);
  if p_stamp then
    execute format('drop trigger if exists aa_stamp on public.%I', p_table);
    execute format('create trigger aa_stamp before insert or update on public.%I for each row execute function public.stamp_row()', p_table);
  end if;
end $$;

-- কে কাকে কোন অ্যাপের অ্যাক্সেস দিল / অনুমোদন দিল — সেটাও লগে থাকবে
select public.scs_attach_triggers('profiles',   'core', 'User',       'email',   false);
select public.scs_attach_triggers('app_access', 'core', 'App Access', 'user_id', false);

-- =====================================================================
--  3. SCS CHEMICAL ORDER
-- =====================================================================
create table if not exists public.chem_products (
  id           text primary key default substr(md5(gen_random_uuid()::text), 1, 8),
  product_name text not null,
  unit         text not null default '',
  pack_sizes   text[] not null default '{}',
  sort_order   int not null default 0,
  created_at timestamptz default now(), created_by uuid,
  updated_at timestamptz default now(), updated_by uuid
);
create unique index if not exists chem_products_name_unit on public.chem_products (lower(product_name), lower(unit));

create table if not exists public.chem_sellers (
  id         text primary key default substr(md5(gen_random_uuid()::text), 1, 8),
  name       text not null,
  sort_order int not null default 0,
  created_at timestamptz default now(), created_by uuid,
  updated_at timestamptz default now(), updated_by uuid
);
create unique index if not exists chem_sellers_name on public.chem_sellers (lower(name));

-- একটি অর্ডার = একটি রো; প্রোডাক্টগুলো items (jsonb) এ
create table if not exists public.chem_orders (
  order_no               text primary key,
  delivery_at            text not null default '',
  client_name            text not null default '',
  mobile                 text not null default '',
  address                text not null default '',
  transport_fee          numeric not null default 0,
  scs_transport_cost     numeric not null default 0,
  order_by               text not null default '',
  commission_holder_name text not null default '',
  items                  jsonb not null default '[]'::jsonb,
  sms_status             text not null default 'Pending',
  pdf_status             text not null default 'Not Uploaded',
  pdf_path               text,
  created_at timestamptz default now(), created_by uuid,
  updated_at timestamptz default now(), updated_by uuid
);
create index if not exists chem_orders_created on public.chem_orders (created_at desc);
create index if not exists chem_orders_mobile  on public.chem_orders (mobile);

create table if not exists public.chem_settings (
  key   text primary key,
  value jsonb,
  created_at timestamptz default now(), created_by uuid,
  updated_at timestamptz default now(), updated_by uuid
);

-- গোপন তথ্য (SMS API key) — কেউ পড়তে পারে না, শুধু Netlify function (service role)
create table if not exists public.chem_secrets (
  key        text primary key,
  value      text,
  updated_at timestamptz default now(),
  updated_by uuid
);

select public.scs_attach_triggers('chem_products', 'chemical-order', 'Product',  'product_name');
select public.scs_attach_triggers('chem_sellers',  'chemical-order', 'Seller',   'name');
select public.scs_attach_triggers('chem_orders',   'chemical-order', 'Order',    'order_no');
select public.scs_attach_triggers('chem_settings', 'chemical-order', 'Settings', 'key');

create or replace function public.chem_set_secret(p_key text, p_value text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.has_app('chemical-order', 'admin') then raise exception 'Admin access required'; end if;
  insert into public.chem_secrets (key, value, updated_at, updated_by) values (p_key, p_value, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  insert into public.audit_log (app_key, table_name, entity, record_ref, action, old_data, new_data, changed_fields, actor_id, actor_email, actor_name)
  select 'chemical-order', 'chem_secrets', 'Settings', p_key, 'Edit', null, jsonb_build_object('value','•••• (changed)'), array['value'],
         auth.uid(), p.email, coalesce(nullif(p.full_name,''), p.email) from public.profiles p where p.id = auth.uid();
end $$;

create or replace function public.chem_next_order_no() returns text
language sql stable set search_path = public as $$
  select to_char(now() at time zone 'Asia/Dhaka', 'YYYYMM') || '-' ||
         lpad((coalesce(max(split_part(order_no, '-', 2)::int), 0) + 1)::text, 2, '0')
  from public.chem_orders
  where order_no like to_char(now() at time zone 'Asia/Dhaka', 'YYYYMM') || '-%'
    and split_part(order_no, '-', 2) ~ '^[0-9]+$';
$$;

-- নতুন অর্ডার: অর্ডার নম্বর এখানেই (লক করে) তৈরি হয় — দুজন একসাথে সাবমিট করলেও নম্বর ডুপ্লিকেট হবে না
create or replace function public.chem_create_order(p jsonb) returns text
language plpgsql security invoker set search_path = public as $$
declare v_no text;
begin
  if not public.has_app('chemical-order') then raise exception 'Chemical Order access required'; end if;
  perform pg_advisory_xact_lock(hashtext('scs_chem_order_no'));
  v_no := public.chem_next_order_no();
  insert into public.chem_orders (order_no, delivery_at, client_name, mobile, address, transport_fee,
                                  scs_transport_cost, order_by, commission_holder_name, items, sms_status, pdf_status)
  values (v_no, coalesce(p->>'delivery_at',''), coalesce(p->>'client_name',''), coalesce(p->>'mobile',''),
          coalesce(p->>'address',''), coalesce((p->>'transport_fee')::numeric, 0),
          coalesce((p->>'scs_transport_cost')::numeric, 0), coalesce(p->>'order_by',''),
          coalesce(p->>'commission_holder_name',''), coalesce(p->'items','[]'::jsonb), 'Pending', 'Not Uploaded');
  return v_no;
end $$;

-- লাইভ রিফ্রেশের জন্য হালকা "ভার্সন"
create or replace function public.chem_data_version() returns text
language sql stable set search_path = public as $$
  select coalesce((select max(id) from public.audit_log where app_key = 'chemical-order'), 0)::text || '-' ||
         (select count(*) from public.chem_orders)::text;
$$;

-- =====================================================================
--  4. SCS EMPLOYEE ATTENDANCE
-- =====================================================================
create table if not exists public.att_employees (
  id          text primary key,
  emp_id      text not null,
  name        text not null default '',
  designation text not null default '',
  department  text not null default '',
  mobile      text not null default '',
  photo_url   text not null default '',
  sort_order  int not null default 0,
  created_at timestamptz default now(), created_by uuid,
  updated_at timestamptz default now(), updated_by uuid
);

create table if not exists public.att_records (
  id               text primary key,
  emp_id           text not null,
  date             text not null,          -- yyyy-MM-dd
  type             text not null,          -- Clock IN / Clock Out
  time             text not null default '',
  lat              double precision default 0,
  lng              double precision default 0,
  location_text    text default '',
  note             text default '',
  created_by_label text default 'user',
  created_at timestamptz default now(), created_by uuid,
  updated_at timestamptz default now(), updated_by uuid
);
create index if not exists att_records_date on public.att_records (date);
create index if not exists att_records_emp  on public.att_records (emp_id, date);

create table if not exists public.att_settings (
  key   text primary key,
  value jsonb,
  created_at timestamptz default now(), created_by uuid,
  updated_at timestamptz default now(), updated_by uuid
);

-- শেয়ার্ড টেবিল: Attendance লেখে, Monthly Report পড়ে
create table if not exists public.att_monthly_summary (
  month_key       text not null,           -- yyyy-MM
  emp_id          text not null,
  sl_no           int  not null default 0,
  name            text not null default '',
  designation     text not null default '',
  department      text not null default '',
  photo_url       text not null default '',
  present         int  not null default 0,
  absent          int  not null default 0,
  late_days       int  not null default 0,
  attendance_rate text not null default '0%',
  updated_at      timestamptz default now(),
  updated_by      uuid,
  primary key (month_key, emp_id)
);

select public.scs_attach_triggers('att_employees', 'attendance', 'Employee',   'emp_id');
select public.scs_attach_triggers('att_records',   'attendance', 'Attendance', 'emp_id');
select public.scs_attach_triggers('att_settings',  'attendance', 'Settings',   'key');

-- =====================================================================
--  5. SCS MONTHLY REPORT
-- =====================================================================
create table if not exists public.mr_month_data (
  month_key text primary key check (month_key ~ '^\d{4}-\d{2}$'),
  data      jsonb not null default '{}'::jsonb,
  created_at timestamptz default now(), created_by uuid,
  updated_at timestamptz default now(), updated_by uuid
);

create table if not exists public.mr_settings (
  key   text primary key,
  value text,
  created_at timestamptz default now(), created_by uuid,
  updated_at timestamptz default now(), updated_by uuid
);

select public.scs_attach_triggers('mr_month_data', 'monthly-report', 'Monthly Report', 'month_key');
select public.scs_attach_triggers('mr_settings',   'monthly-report', 'Settings',       'key');

-- =====================================================================
--  6. ROW LEVEL SECURITY
-- =====================================================================
alter table public.apps                enable row level security;
alter table public.profiles            enable row level security;
alter table public.app_access          enable row level security;
alter table public.audit_log           enable row level security;
alter table public.chem_products       enable row level security;
alter table public.chem_sellers        enable row level security;
alter table public.chem_orders         enable row level security;
alter table public.chem_settings       enable row level security;
alter table public.chem_secrets        enable row level security;
alter table public.att_employees       enable row level security;
alter table public.att_records         enable row level security;
alter table public.att_settings        enable row level security;
alter table public.att_monthly_summary enable row level security;
alter table public.mr_month_data       enable row level security;
alter table public.mr_settings         enable row level security;

do $$
declare r record;
begin
  -- পুরনো পলিসি মুছে নতুন করে বানানো (বারবার Run করা যায়)
  for r in select schemaname, tablename, policyname from pg_policies
           where schemaname = 'public' and policyname like 'scs_%' loop
    execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- core
create policy scs_apps_read   on public.apps for select to authenticated using (true);
create policy scs_apps_write  on public.apps for all    to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy scs_prof_read   on public.profiles for select to authenticated using (id = auth.uid() or public.is_super_admin());
create policy scs_prof_update on public.profiles for update to authenticated using (id = auth.uid() or public.is_super_admin()) with check (id = auth.uid() or public.is_super_admin());
create policy scs_prof_delete on public.profiles for delete to authenticated using (public.is_super_admin() and id <> auth.uid());

create policy scs_acc_read    on public.app_access for select to authenticated using (user_id = auth.uid() or public.is_super_admin());
create policy scs_acc_write   on public.app_access for all    to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

-- audit log: শুধু পড়া যায় (যে অ্যাপে অ্যাক্সেস আছে); 'core' লগ শুধু সুপার অ্যাডমিন
create policy scs_audit_read  on public.audit_log for select to authenticated
  using (case when app_key = 'core' then public.is_super_admin() else public.has_app(app_key) end);

-- chemical order
create policy scs_cp_read   on public.chem_products for select to authenticated using (public.has_app('chemical-order'));
create policy scs_cp_write  on public.chem_products for all    to authenticated using (public.has_app('chemical-order','admin')) with check (public.has_app('chemical-order','admin'));
create policy scs_cs_read   on public.chem_sellers  for select to authenticated using (public.has_app('chemical-order'));
create policy scs_cs_write  on public.chem_sellers  for all    to authenticated using (public.has_app('chemical-order','admin')) with check (public.has_app('chemical-order','admin'));

create policy scs_co_read   on public.chem_orders for select to authenticated using (public.has_app('chemical-order') or public.has_app('monthly-report'));
create policy scs_co_insert on public.chem_orders for insert to authenticated with check (public.has_app('chemical-order'));
create policy scs_co_update on public.chem_orders for update to authenticated using (public.has_app('chemical-order')) with check (public.has_app('chemical-order'));
create policy scs_co_delete on public.chem_orders for delete to authenticated using (public.has_app('chemical-order','admin'));

create policy scs_cset_read  on public.chem_settings for select to authenticated using (public.has_app('chemical-order'));
create policy scs_cset_write on public.chem_settings for all    to authenticated using (public.has_app('chemical-order','admin')) with check (public.has_app('chemical-order','admin'));
-- chem_secrets: কোনো পলিসি নেই = কেউ পড়তে/লিখতে পারে না (শুধু chem_set_secret ফাংশন ও service role)

-- attendance
create policy scs_ae_read   on public.att_employees for select to authenticated using (public.has_app('attendance') or public.has_app('monthly-report'));
create policy scs_ae_write  on public.att_employees for all    to authenticated using (public.has_app('attendance','admin')) with check (public.has_app('attendance','admin'));

create policy scs_ar_read   on public.att_records for select to authenticated using (public.has_app('attendance'));
create policy scs_ar_insert on public.att_records for insert to authenticated with check (public.has_app('attendance'));
create policy scs_ar_update on public.att_records for update to authenticated using (public.has_app('attendance','admin')) with check (public.has_app('attendance','admin'));
create policy scs_ar_delete on public.att_records for delete to authenticated using (public.has_app('attendance','admin'));

create policy scs_aset_read  on public.att_settings for select to authenticated using (public.has_app('attendance'));
create policy scs_aset_write on public.att_settings for all    to authenticated using (public.has_app('attendance','admin')) with check (public.has_app('attendance','admin'));

create policy scs_asum_read  on public.att_monthly_summary for select to authenticated using (public.has_app('attendance') or public.has_app('monthly-report'));
create policy scs_asum_write on public.att_monthly_summary for all    to authenticated using (public.has_app('attendance')) with check (public.has_app('attendance'));

-- monthly report
create policy scs_mm_read   on public.mr_month_data for select to authenticated using (public.has_app('monthly-report'));
create policy scs_mm_insert on public.mr_month_data for insert to authenticated with check (public.has_app('monthly-report'));
create policy scs_mm_update on public.mr_month_data for update to authenticated using (public.has_app('monthly-report')) with check (public.has_app('monthly-report'));
create policy scs_mm_delete on public.mr_month_data for delete to authenticated using (public.has_app('monthly-report','admin'));

create policy scs_ms_read   on public.mr_settings for select to authenticated using (public.has_app('monthly-report'));
create policy scs_ms_write  on public.mr_settings for all    to authenticated using (public.has_app('monthly-report')) with check (public.has_app('monthly-report'));

-- =====================================================================
--  7. STORAGE (লোগো, লেটারহেড, গান, PDF) — bucket: scs-files (private)
--     পাথের প্রথম ফোল্ডার = app key, যেমন chemical-order/letterhead.png
-- =====================================================================
insert into storage.buckets (id, name, public) values ('scs-files', 'scs-files', false)
on conflict (id) do nothing;

drop policy if exists scs_files_read   on storage.objects;
drop policy if exists scs_files_insert on storage.objects;
drop policy if exists scs_files_update on storage.objects;
drop policy if exists scs_files_delete on storage.objects;
create policy scs_files_read   on storage.objects for select to authenticated
  using (bucket_id = 'scs-files' and public.has_app((storage.foldername(name))[1]));
create policy scs_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'scs-files' and public.has_app((storage.foldername(name))[1]));
create policy scs_files_update on storage.objects for update to authenticated
  using (bucket_id = 'scs-files' and public.has_app((storage.foldername(name))[1]));
create policy scs_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'scs-files' and public.has_app((storage.foldername(name))[1]));

-- =====================================================================
--  8. v2: প্রোফাইল = এমপ্লয়ি, ডকুমেন্ট, সিস্টেম সেটিংস, অ্যাডমিন পিন,
--     নোটিফিকেশন / পুশ, পাসওয়ার্ড রিসেট কোড
-- =====================================================================

-- ---------- profiles: এমপ্লয়ি তথ্য ----------
alter table public.profiles add column if not exists employee_id text;
alter table public.profiles add column if not exists photo_url   text not null default '';
alter table public.profiles add column if not exists designation text not null default '';
alter table public.profiles add column if not exists department  text not null default '';
alter table public.profiles add column if not exists is_employee boolean not null default true;
create unique index if not exists profiles_employee_id on public.profiles (employee_id) where employee_id is not null;

alter table public.att_employees add column if not exists user_id uuid references public.profiles(id) on delete set null;
alter table public.att_employees add column if not exists active  boolean not null default true;
create unique index if not exists att_employees_user on public.att_employees (user_id) where user_id is not null;

-- পরের Employee ID (SCS-101, SCS-102 ...)
create or replace function public.scs_next_emp_id() returns text
language sql stable security definer set search_path = public as $$
  select 'SCS-' || (greatest(
    100,
    coalesce((select max(substring(emp_id from '^SCS-(\d+)$')::int) from public.att_employees where emp_id ~ '^SCS-\d+$'), 100),
    coalesce((select max(substring(employee_id from '^SCS-(\d+)$')::int) from public.profiles where employee_id ~ '^SCS-\d+$'), 100)
  ) + 1)::text;
$$;

-- সাধারণ ইউজার নিজের status / super-admin / Employee ID / পদবি বদলাতে পারবে না
create or replace function public.profiles_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if not public.is_super_admin() then
      new.status := old.status;
      new.is_super_admin := old.is_super_admin;
      new.approved_by := old.approved_by;
      new.approved_at := old.approved_at;
      new.email := old.email;
      new.employee_id := old.employee_id;
      new.designation := old.designation;
      new.department := old.department;
      new.is_employee := old.is_employee;
    elsif new.status = 'active' and old.status <> 'active' then
      new.approved_by := auth.uid(); new.approved_at := now();
    end if;
    new.updated_by := auth.uid();
  end if;
  new.employee_id := nullif(trim(coalesce(new.employee_id, '')), '');
  if new.status = 'active' and new.is_employee and new.employee_id is null then
    new.employee_id := public.scs_next_emp_id();
  end if;
  new.updated_at := now();
  return new;
end $$;

-- অনুমোদিত অ্যাকাউন্ট -> Attendance-এর এমপ্লয়ি (নাম, মোবাইল, ছবি, ID সবসময় প্রোফাইল থেকে)
create or replace function public.sync_employee_from_profile() returns trigger
language plpgsql security definer set search_path = public as $$
declare e record; v_name text;
begin
  v_name := coalesce(nullif(trim(new.full_name), ''), new.email);
  select * into e from public.att_employees where user_id = new.id;
  if not (new.status = 'active' and new.is_employee) then
    if found and e.active then update public.att_employees set active = false where id = e.id; end if;
    return null;
  end if;
  if not found then
    -- পুরনো শিট থেকে আনা একই Employee ID থাকলে সেটার সাথেই জুড়ে দেওয়া (হাজিরার ইতিহাস ঠিক থাকে)
    select * into e from public.att_employees where emp_id = new.employee_id and user_id is null limit 1;
    if found then
      update public.att_employees set user_id = new.id where id = e.id;
    else
      insert into public.att_employees (id, emp_id, name, designation, department, mobile, photo_url, sort_order, user_id, active)
      values ('u-' || replace(new.id::text, '-', ''), new.employee_id, v_name, new.designation, new.department,
              new.phone, new.photo_url, coalesce((select max(sort_order) from public.att_employees), 0) + 1, new.id, true);
      return null;
    end if;
  end if;
  if e.emp_id is distinct from new.employee_id then
    update public.att_records set emp_id = new.employee_id where emp_id = e.emp_id;
    delete from public.att_monthly_summary where emp_id = new.employee_id;
    update public.att_monthly_summary set emp_id = new.employee_id where emp_id = e.emp_id;
  end if;
  update public.att_employees set
    emp_id = new.employee_id, name = v_name, mobile = new.phone,
    photo_url   = case when new.photo_url   <> '' then new.photo_url   else photo_url   end,
    designation = case when new.designation <> '' then new.designation else designation end,
    department  = case when new.department  <> '' then new.department  else department  end,
    active = true, user_id = new.id
  where id = e.id;
  return null;
end $$;

drop trigger if exists zz_sync_employee on public.profiles;
create trigger zz_sync_employee after insert or update on public.profiles
  for each row execute function public.sync_employee_from_profile();

-- ---------- প্রোফাইল ডকুমেন্ট (NID, সার্টিফিকেট) ----------
create table if not exists public.profile_documents (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('nid_front','nid_back','certificate','other')),
  title      text not null default '',
  path       text not null,
  mime       text not null default '',
  size       int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists profile_documents_user on public.profile_documents (user_id);
select public.scs_attach_triggers('profile_documents', 'core', 'Document', 'title', false);

-- ---------- সিস্টেম সেটিংস (লোগো, SMS গেটওয়ে) ও গোপন তথ্য ----------
create table if not exists public.sys_settings (
  key   text primary key,
  value jsonb,
  updated_at timestamptz default now(),
  updated_by uuid
);
create table if not exists public.sys_secrets (      -- কোনো পলিসি নেই: শুধু Netlify function (service role)
  key        text primary key,
  value      text,
  updated_at timestamptz default now(),
  updated_by uuid
);
select public.scs_attach_triggers('sys_settings', 'core', 'System Settings', 'key', false);

create or replace function public.sys_set_secret(p_key text, p_value text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_super_admin() then raise exception 'Super Admin access required'; end if;
  insert into public.sys_secrets (key, value, updated_at, updated_by) values (p_key, p_value, now(), auth.uid())
  on conflict (key) do update set value = excluded.value, updated_at = now(), updated_by = auth.uid();
  insert into public.audit_log (app_key, table_name, entity, record_ref, action, new_data, changed_fields, actor_id, actor_email, actor_name)
  select 'core', 'sys_secrets', 'System Settings', p_key, 'Edit', jsonb_build_object('value', '•••• (changed)'), array['value'],
         auth.uid(), p.email, coalesce(nullif(p.full_name, ''), p.email) from public.profiles p where p.id = auth.uid();
end $$;

-- কোন গোপন তথ্য সেট করা আছে (মান নয়, শুধু হ্যাঁ/না)
create or replace function public.sys_secret_status() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_super_admin()
    then coalesce((select jsonb_object_agg(key, (coalesce(value, '') <> '')) from public.sys_secrets where key not like 'vapid%'), '{}'::jsonb)
    else '{}'::jsonb end;
$$;

-- ---------- প্রতিটি অ্যাপের অ্যাডমিন পিন ----------
create table if not exists public.app_pins (
  app_key    text primary key references public.apps(key) on delete cascade on update cascade,
  pin        text not null default '2026' check (pin ~ '^\d{4}$'),
  updated_at timestamptz default now(),
  updated_by uuid
);
insert into public.app_pins (app_key) select key from public.apps on conflict (app_key) do nothing;

create or replace function public.app_pins_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now(); new.updated_by := auth.uid();
  if tg_op = 'UPDATE' and new.pin is distinct from old.pin then
    insert into public.audit_log (app_key, table_name, entity, record_ref, action, new_data, changed_fields, actor_id, actor_email, actor_name)
    select 'core', 'app_pins', 'Admin PIN', new.app_key, 'Edit', jsonb_build_object('pin', '•••• (changed)'), array['pin'],
           auth.uid(), p.email, coalesce(nullif(p.full_name, ''), p.email) from public.profiles p where p.id = auth.uid();
  end if;
  return new;
end $$;
drop trigger if exists app_pins_log on public.app_pins;
create trigger app_pins_log before insert or update on public.app_pins
  for each row execute function public.app_pins_log();

-- নতুন অ্যাপ যোগ হলে তার পিনও তৈরি
create or replace function public.apps_add_pin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.app_pins (app_key) values (new.key) on conflict (app_key) do nothing;
  return null;
end $$;
drop trigger if exists apps_add_pin on public.apps;
create trigger apps_add_pin after insert on public.apps
  for each row execute function public.apps_add_pin();
select public.scs_attach_triggers('apps', 'core', 'App', 'key', false);

-- ---------- নোটিফিকেশন ও পুশ ----------
create table if not exists public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  app_key    text not null default 'core',
  title      text not null,
  body       text not null default '',
  url        text not null default '/',
  created_at timestamptz not null default now(),
  read_at    timestamptz,
  pushed_at  timestamptz
);
create index if not exists notifications_user on public.notifications (user_id, id desc);
create index if not exists notifications_push on public.notifications (pushed_at) where pushed_at is null;

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

-- একটি অ্যাপের সব ইউজার (+ Super Admin) কে নোটিফিকেশন; p_app = 'core' হলে শুধু Super Admin
create or replace function public.scs_notify(p_app text, p_title text, p_body text, p_url text, p_exclude uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into public.notifications (user_id, app_key, title, body, url)
  select p.id, p_app, p_title, coalesce(p_body, ''), coalesce(p_url, '/')
  from public.profiles p
  where p.status = 'active' and p.id is distinct from p_exclude
    and (p.is_super_admin or exists (select 1 from public.app_access a where a.user_id = p.id and a.app_key = p_app));
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.scs_notify(text, text, text, text, uuid) from public, anon, authenticated;

-- নতুন অ্যাকাউন্ট -> Super Admin দের নোটিফিকেশন
create or replace function public.notify_new_account() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.scs_notify('core', 'New account waiting for approval',
    coalesce(nullif(new.full_name, ''), new.email) || ' · ' || new.email, '/admin.html', new.id);
  return null;
end $$;
drop trigger if exists zz_notify_new_account on public.profiles;
create trigger zz_notify_new_account after insert on public.profiles
  for each row execute function public.notify_new_account();

-- নতুন অর্ডার: নম্বর তৈরি + সবাইকে নোটিফিকেশন (রিস্টোর করা পুরনো অর্ডারে নোটিফিকেশন যায় না)
drop function if exists public.chem_notify_order(text, text, numeric, text);
create or replace function public.chem_create_order(p jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare v_no text; v_total numeric; v_by text;
begin
  if not public.has_app('chemical-order') then raise exception 'Chemical Order access required'; end if;
  perform pg_advisory_xact_lock(hashtext('scs_chem_order_no'));
  v_no := public.chem_next_order_no();
  insert into public.chem_orders (order_no, delivery_at, client_name, mobile, address, transport_fee,
                                  scs_transport_cost, order_by, commission_holder_name, items, sms_status, pdf_status)
  values (v_no, coalesce(p->>'delivery_at',''), coalesce(p->>'client_name',''), coalesce(p->>'mobile',''),
          coalesce(p->>'address',''), coalesce((p->>'transport_fee')::numeric, 0),
          coalesce((p->>'scs_transport_cost')::numeric, 0), coalesce(p->>'order_by',''),
          coalesce(p->>'commission_holder_name',''), coalesce(p->'items','[]'::jsonb), 'Pending', 'Not Uploaded');
  select coalesce(sum(coalesce(nullif(i->>'quantity','')::numeric, 0) * coalesce(nullif(i->>'discountUnitPrice','')::numeric, 0)), 0)
    into v_total from jsonb_array_elements(coalesce(p->'items','[]'::jsonb)) i;
  v_total := v_total + coalesce((p->>'transport_fee')::numeric, 0);
  v_by := coalesce(p->>'order_by', '');
  perform public.scs_notify('chemical-order', 'New order ' || v_no,
    coalesce(nullif(p->>'client_name', ''), 'Customer') || ' · Tk ' || to_char(v_total, 'FM999,999,999,990') ||
    case when v_by <> '' then ' · by ' || v_by else '' end,
    '/apps/chemical-order/', auth.uid());
  return v_no;
end $$;

-- নোটিফিকেশন লাইভ (Realtime)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

-- ---------- মোবাইলে পাসওয়ার্ড রিসেট কোড (শুধু Netlify function ব্যবহার করে) ----------
create table if not exists public.password_reset_codes (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  code_hash  text not null,
  expires_at timestamptz not null,
  attempts   int not null default 0,
  sent_count int not null default 1,
  window_start timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- ---------- v2 RLS ----------
alter table public.profile_documents    enable row level security;
alter table public.sys_settings         enable row level security;
alter table public.sys_secrets          enable row level security;
alter table public.app_pins             enable row level security;
alter table public.notifications        enable row level security;
alter table public.push_subscriptions   enable row level security;
alter table public.password_reset_codes enable row level security;

-- Activity Log শুধু Super Admin মুছতে পারেন
create policy scs_audit_delete on public.audit_log for delete to authenticated using (public.is_super_admin());

create policy scs_doc_read   on public.profile_documents for select to authenticated using (user_id = auth.uid() or public.is_super_admin());
create policy scs_doc_insert on public.profile_documents for insert to authenticated with check (user_id = auth.uid() or public.is_super_admin());
create policy scs_doc_delete on public.profile_documents for delete to authenticated using (user_id = auth.uid() or public.is_super_admin());

-- লোগো (branding) লগইনের আগেও দেখা যায়; SMS সেটিং শুধু Super Admin
create policy scs_sys_read  on public.sys_settings for select to anon, authenticated using (key = 'branding' or public.is_super_admin());
create policy scs_sys_write on public.sys_settings for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

-- অ্যাডমিন পিন: শুধু সেই অ্যাপের Admin পড়তে পারে, শুধু Super Admin বদলাতে পারে
create policy scs_pin_read  on public.app_pins for select to authenticated using (public.has_app(app_key, 'admin'));
create policy scs_pin_write on public.app_pins for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy scs_ntf_read   on public.notifications for select to authenticated using (user_id = auth.uid());
create policy scs_ntf_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy scs_ntf_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

create policy scs_push_all on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- v2 Storage ----------
-- scs-public (পাবলিক): avatars/<user id>/..., branding/...
insert into storage.buckets (id, name, public) values ('scs-public', 'scs-public', true)
on conflict (id) do update set public = true;

drop policy if exists scs_pub_read   on storage.objects;
drop policy if exists scs_pub_insert on storage.objects;
drop policy if exists scs_pub_update on storage.objects;
drop policy if exists scs_pub_delete on storage.objects;
create policy scs_pub_read on storage.objects for select to authenticated using (bucket_id = 'scs-public');
create policy scs_pub_insert on storage.objects for insert to authenticated with check (bucket_id = 'scs-public' and (
  ((storage.foldername(name))[1] = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text) or public.is_super_admin()));
create policy scs_pub_update on storage.objects for update to authenticated using (bucket_id = 'scs-public' and (
  ((storage.foldername(name))[1] = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text) or public.is_super_admin()));
create policy scs_pub_delete on storage.objects for delete to authenticated using (bucket_id = 'scs-public' and (
  ((storage.foldername(name))[1] = 'avatars' and (storage.foldername(name))[2] = auth.uid()::text) or public.is_super_admin()));

-- scs-files/profiles/<user id>/... : NID ও সার্টিফিকেট (নিজে ও Super Admin)
drop policy if exists scs_prof_files_read   on storage.objects;
drop policy if exists scs_prof_files_insert on storage.objects;
drop policy if exists scs_prof_files_delete on storage.objects;
drop policy if exists scs_prof_files_update on storage.objects;
create policy scs_prof_files_update on storage.objects for update to authenticated using (bucket_id = 'scs-files' and
  (storage.foldername(name))[1] = 'profiles' and ((storage.foldername(name))[2] = auth.uid()::text or public.is_super_admin()));
create policy scs_prof_files_read on storage.objects for select to authenticated using (bucket_id = 'scs-files' and
  (storage.foldername(name))[1] = 'profiles' and ((storage.foldername(name))[2] = auth.uid()::text or public.is_super_admin()));
create policy scs_prof_files_insert on storage.objects for insert to authenticated with check (bucket_id = 'scs-files' and
  (storage.foldername(name))[1] = 'profiles' and ((storage.foldername(name))[2] = auth.uid()::text or public.is_super_admin()));
create policy scs_prof_files_delete on storage.objects for delete to authenticated using (bucket_id = 'scs-files' and
  (storage.foldername(name))[1] = 'profiles' and ((storage.foldername(name))[2] = auth.uid()::text or public.is_super_admin()));

-- আগে থেকে অনুমোদিত অ্যাকাউন্টগুলোকে এমপ্লয়ি তালিকায় আনা (বারবার Run করলেও ক্ষতি নেই)
update public.profiles set is_employee = is_employee where status = 'active';

-- =====================================================================
--  9. প্রথম সুপার অ্যাডমিন বানানো (একবারই)
--  প্রথমে ওয়েবসাইটে নিজের ইমেইল দিয়ে Sign up করুন, তারপর নিচের লাইনে
--  ইমেইল বদলে শুধু এই লাইনটি Run করুন:
--
--  (লাইনের শুরুতে -- থাকলে সেটা চলে না — New query তে -- ছাড়া পেস্ট করুন)
--
--  insert into public.profiles (id, email, status, is_super_admin)
--  select id, email, 'active', true from auth.users where lower(email) = lower('scssouravmridha@gmail.com')
--  on conflict (id) do update set status = 'active', is_super_admin = true;
-- =====================================================================
