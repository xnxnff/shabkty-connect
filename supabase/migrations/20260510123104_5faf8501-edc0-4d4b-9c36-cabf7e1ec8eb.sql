
-- Enums
create type public.app_role as enum ('admin','user');
create type public.order_status as enum ('pending','approved','rejected','expired');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

-- User roles
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create policy "roles_select_own" on public.user_roles for select using (auth.uid() = user_id);
create policy "roles_admin_all" on public.user_roles for all
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- Auto-create profile + default role on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  insert into public.user_roles(user_id, role) values (new.id, 'user');
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Categories
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamptz not null default now()
);
alter table public.categories enable row level security;
create policy "categories_public_read" on public.categories for select using (true);
create policy "categories_admin_all" on public.categories for all
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- Packages
create table public.packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price_iqd integer not null check (price_iqd >= 0),
  duration_days integer not null check (duration_days > 0),
  image_url text,
  category_id uuid references public.categories(id) on delete set null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.packages enable row level security;
create policy "packages_public_read" on public.packages for select
  using (is_active or public.has_role(auth.uid(),'admin'));
create policy "packages_admin_all" on public.packages for all
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- Popup ads
create table public.popup_ads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  image_url text,
  link_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.popup_ads enable row level security;
create policy "ads_public_read" on public.popup_ads for select using (is_active);
create policy "ads_admin_all" on public.popup_ads for all
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));

-- Orders
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  package_id uuid not null references public.packages(id) on delete restrict,
  full_name text not null,
  payment_screenshot_url text not null,
  verification_code text not null,
  status public.order_status not null default 'pending',
  admin_note text,
  delivered_code text,
  delivered_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index orders_user_idx on public.orders(user_id);
create index orders_status_idx on public.orders(status);
alter table public.orders enable row level security;
create policy "orders_user_select" on public.orders for select
  using (auth.uid() = user_id or public.has_role(auth.uid(),'admin'));
create policy "orders_user_insert" on public.orders for insert
  with check (auth.uid() = user_id);
create policy "orders_admin_update" on public.orders for update
  using (public.has_role(auth.uid(),'admin'))
  with check (public.has_role(auth.uid(),'admin'));
create policy "orders_admin_delete" on public.orders for delete
  using (public.has_role(auth.uid(),'admin'));

-- Notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  type text not null default 'info',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.notifications enable row level security;
create policy "notif_user_select" on public.notifications for select using (auth.uid() = user_id);
create policy "notif_user_update" on public.notifications for update using (auth.uid() = user_id);
create policy "notif_admin_insert" on public.notifications for insert
  with check (public.has_role(auth.uid(),'admin') or auth.uid() = user_id);

-- Trigger: when admin approves/rejects an order, set timestamps + notify user
create or replace function public.on_order_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare pkg_duration int;
begin
  if NEW.status = 'approved' and OLD.status is distinct from 'approved' then
    select duration_days into pkg_duration from public.packages where id = NEW.package_id;
    NEW.delivered_at := now();
    NEW.expires_at := now() + make_interval(days => pkg_duration);
    insert into public.notifications(user_id, title, body, type)
      values (NEW.user_id, 'تم تفعيل اشتراكك', 'تم قبول طلبك وإرسال كود الاشتراك إليك.', 'success');
  elsif NEW.status = 'rejected' and OLD.status is distinct from 'rejected' then
    insert into public.notifications(user_id, title, body, type)
      values (NEW.user_id, 'تم رفض الطلب', coalesce(NEW.admin_note, 'يرجى مراجعة بيانات الدفع.'), 'error');
  end if;
  return NEW;
end; $$;

create trigger trg_orders_status before update on public.orders
  for each row execute function public.on_order_status_change();

-- Storage buckets
insert into storage.buckets (id, name, public) values
  ('package-images','package-images', true),
  ('ad-images','ad-images', true),
  ('payment-screenshots','payment-screenshots', false);

-- Storage policies
create policy "pkg_imgs_public_read" on storage.objects for select
  using (bucket_id = 'package-images');
create policy "pkg_imgs_admin_write" on storage.objects for insert
  with check (bucket_id = 'package-images' and public.has_role(auth.uid(),'admin'));
create policy "pkg_imgs_admin_update" on storage.objects for update
  using (bucket_id = 'package-images' and public.has_role(auth.uid(),'admin'));
create policy "pkg_imgs_admin_delete" on storage.objects for delete
  using (bucket_id = 'package-images' and public.has_role(auth.uid(),'admin'));

create policy "ad_imgs_public_read" on storage.objects for select
  using (bucket_id = 'ad-images');
create policy "ad_imgs_admin_write" on storage.objects for insert
  with check (bucket_id = 'ad-images' and public.has_role(auth.uid(),'admin'));
create policy "ad_imgs_admin_update" on storage.objects for update
  using (bucket_id = 'ad-images' and public.has_role(auth.uid(),'admin'));
create policy "ad_imgs_admin_delete" on storage.objects for delete
  using (bucket_id = 'ad-images' and public.has_role(auth.uid(),'admin'));

create policy "pay_user_upload" on storage.objects for insert
  with check (bucket_id = 'payment-screenshots' and auth.uid()::text = (storage.foldername(name))[1]);
create policy "pay_user_read" on storage.objects for select
  using (bucket_id = 'payment-screenshots' and (auth.uid()::text = (storage.foldername(name))[1] or public.has_role(auth.uid(),'admin')));
