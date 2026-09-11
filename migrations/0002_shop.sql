-- PUZZLECANDY shop schema. Money is integer cents. IDs are text (app-generated).

create table if not exists id_sequences (
  name text primary key,
  value integer not null default 0
);

create table if not exists shop_settings (
  key text primary key,
  value_json jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists shop_users (
  id text primary key,
  telegram_id bigint not null unique,
  username text,
  first_name text,
  last_name text,
  language text not null default 'ru',
  balance_cents integer not null default 0,
  purchases_count integer not null default 0,
  discount_percent integer not null default 0,
  referral_code text not null unique,
  referred_by text,
  referrals_count integer not null default 0,
  referral_earned_cents integer not null default 0,
  status text not null default 'ACTIVE',
  registered_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shop_users_balance_nonneg check (balance_cents >= 0),
  constraint shop_users_discount_range check (discount_percent >= 0 and discount_percent <= 90),
  constraint shop_users_status_chk check (status in ('ACTIVE', 'BLOCKED', 'VIP'))
);

create index if not exists shop_users_username_idx on shop_users (username);
create index if not exists shop_users_status_idx on shop_users (status);
create index if not exists shop_users_registered_idx on shop_users (registered_at desc);

create table if not exists admins (
  id text primary key,
  user_id text not null unique,
  email text,
  name text,
  role text not null default 'ADMIN',
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz,
  constraint admins_role_chk check (role in ('SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'SUPPORT', 'FINANCE', 'COURIER_MANAGER')),
  constraint admins_status_chk check (status in ('ACTIVE', 'DISABLED'))
);

create table if not exists role_permissions (
  role text not null,
  permission text not null,
  primary key (role, permission)
);

create table if not exists categories (
  id text primary key,
  slug text not null unique,
  name_i18n jsonb not null,
  description_i18n jsonb not null default '{}'::jsonb,
  icon text,
  sort_order integer not null default 0,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_status_chk check (status in ('ACTIVE', 'HIDDEN'))
);

create table if not exists products (
  id text primary key,
  slug text not null unique,
  name_i18n jsonb not null,
  description_i18n jsonb not null default '{}'::jsonb,
  short_description_i18n jsonb not null default '{}'::jsonb,
  specs_i18n jsonb not null default '{}'::jsonb,
  price_cents integer not null,
  old_price_cents integer,
  discount_percent integer not null default 0,
  category_id text references categories (id),
  stock integer not null default 0,
  status text not null default 'DRAFT',
  published boolean not null default false,
  featured boolean not null default false,
  sort_order integer not null default 0,
  rating_sum integer not null default 0,
  rating_count integer not null default 0,
  purchases_count integer not null default 0,
  moderation_status text not null default 'APPROVED',
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint products_price_chk check (price_cents >= 0),
  constraint products_stock_chk check (stock >= 0),
  constraint products_status_chk check (status in ('DRAFT', 'PENDING', 'ACTIVE', 'HIDDEN', 'OUT_OF_STOCK', 'ARCHIVED')),
  constraint products_mod_chk check (moderation_status in ('SUBMITTED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'))
);

create index if not exists products_category_idx on products (category_id);
create index if not exists products_status_idx on products (status, published);
create index if not exists products_featured_idx on products (featured);

create table if not exists product_images (
  id text primary key,
  product_id text not null references products (id) on delete cascade,
  url text not null,
  alt text,
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists product_images_product_idx on product_images (product_id, sort_order);

create table if not exists product_submissions (
  id text primary key,
  courier_id text,
  product_id text references products (id),
  name text not null,
  description text,
  quantity integer not null default 1,
  photos_json jsonb not null default '[]'::jsonb,
  status text not null default 'SUBMITTED',
  reason text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint product_submissions_status_chk check (status in ('SUBMITTED', 'PENDING_REVIEW', 'APPROVED', 'REJECTED'))
);

create table if not exists orders (
  id text primary key,
  public_code text not null unique,
  user_id text not null references shop_users (id),
  status text not null default 'NEW',
  subtotal_cents integer not null,
  discount_cents integer not null default 0,
  total_cents integer not null,
  currency text not null default 'USD',
  notes text,
  delivery_notes text,
  destination text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  constraint orders_status_chk check (status in (
    'NEW','PAID','PROCESSING','PREPARING','COURIER_ASSIGNED','IN_DELIVERY',
    'DELIVERED','COMPLETED','CANCELLED','REFUNDED'
  ))
);

create index if not exists orders_user_idx on orders (user_id, created_at desc);
create index if not exists orders_status_idx on orders (status);
create index if not exists orders_created_idx on orders (created_at desc);

create table if not exists order_items (
  id text primary key,
  order_id text not null references orders (id) on delete cascade,
  product_id text not null references products (id),
  product_name text not null,
  unit_price_cents integer not null,
  quantity integer not null default 1,
  total_cents integer not null
);

create index if not exists order_items_order_idx on order_items (order_id);

create table if not exists order_events (
  id text primary key,
  order_id text not null references orders (id) on delete cascade,
  from_status text,
  to_status text not null,
  actor_type text not null,
  actor_id text,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists order_events_order_idx on order_events (order_id, created_at);

create table if not exists payments (
  id text primary key,
  public_code text not null unique,
  user_id text not null references shop_users (id),
  amount_cents integer not null,
  currency text not null default 'USD',
  status text not null default 'PENDING',
  method text not null default 'MANUAL_SCREENSHOT',
  screenshot_url text,
  telegram_file_id text,
  reviewed_by text,
  reviewed_at timestamptz,
  reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_amount_chk check (amount_cents > 0),
  constraint payments_status_chk check (status in ('PENDING', 'APPROVED', 'REJECTED'))
);

create index if not exists payments_status_idx on payments (status, created_at desc);
create index if not exists payments_user_idx on payments (user_id, created_at desc);

create table if not exists ledger_transactions (
  id text primary key,
  user_id text not null references shop_users (id),
  amount_cents integer not null,
  currency text not null default 'USD',
  type text not null,
  balance_before integer not null,
  balance_after integer not null,
  reference_id text,
  reason text,
  comment text,
  admin_id text,
  created_at timestamptz not null default now(),
  constraint ledger_type_chk check (type in (
    'DEPOSIT','MANUAL_DEPOSIT','MANUAL_WITHDRAW','PURCHASE','REFUND',
    'ADJUSTMENT','BONUS','REFERRAL'
  ))
);

create index if not exists ledger_user_idx on ledger_transactions (user_id, created_at desc);
create index if not exists ledger_type_idx on ledger_transactions (type, created_at desc);
create index if not exists ledger_ref_idx on ledger_transactions (reference_id);

create table if not exists idempotency_keys (
  key text primary key,
  result_json jsonb,
  created_at timestamptz not null default now()
);

create table if not exists reviews (
  id text primary key,
  user_id text not null references shop_users (id),
  order_id text references orders (id),
  product_id text references products (id),
  rating integer not null,
  body text,
  status text not null default 'PENDING',
  admin_reply text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviews_rating_chk check (rating >= 1 and rating <= 5),
  constraint reviews_status_chk check (status in ('PENDING', 'VISIBLE', 'HIDDEN', 'DELETED'))
);

create index if not exists reviews_status_idx on reviews (status, created_at desc);

create table if not exists couriers (
  id text primary key,
  telegram_id bigint not null unique,
  user_id text references shop_users (id),
  username text,
  first_name text,
  status text not null default 'PENDING',
  availability text not null default 'OFFLINE',
  rating_sum integer not null default 0,
  rating_count integer not null default 0,
  completed_count integer not null default 0,
  rejected_count integer not null default 0,
  last_lat double precision,
  last_lng double precision,
  last_location_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint couriers_status_chk check (status in ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED')),
  constraint couriers_avail_chk check (availability in ('ONLINE', 'OFFLINE'))
);

create table if not exists courier_tasks (
  id text primary key,
  public_code text not null unique,
  order_id text references orders (id),
  courier_id text references couriers (id),
  product_summary text,
  quantity integer not null default 1,
  destination text,
  notes text,
  priority text not null default 'NORMAL',
  status text not null default 'ASSIGNED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  completed_at timestamptz,
  constraint courier_tasks_priority_chk check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  constraint courier_tasks_status_chk check (status in (
    'ASSIGNED','ACCEPTED','REJECTED','IN_PROGRESS','PENDING_REVIEW','APPROVED','REJECTED_REVIEW','CANCELLED'
  ))
);

create index if not exists courier_tasks_courier_idx on courier_tasks (courier_id, created_at desc);
create index if not exists courier_tasks_status_idx on courier_tasks (status);

create table if not exists courier_locations (
  id text primary key,
  courier_id text not null references couriers (id) on delete cascade,
  task_id text references courier_tasks (id),
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now()
);

create index if not exists courier_locations_courier_idx on courier_locations (courier_id, created_at desc);

create table if not exists courier_reports (
  id text primary key,
  task_id text not null references courier_tasks (id),
  courier_id text not null references couriers (id),
  comment text,
  lat double precision,
  lng double precision,
  photos_json jsonb not null default '[]'::jsonb,
  status text not null default 'PENDING_REVIEW',
  reason text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint courier_reports_status_chk check (status in ('PENDING_REVIEW', 'APPROVED', 'REJECTED'))
);

create table if not exists support_tickets (
  id text primary key,
  public_code text not null unique,
  user_id text not null references shop_users (id),
  subject text,
  status text not null default 'OPEN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint support_status_chk check (status in ('OPEN', 'IN_PROGRESS', 'WAITING', 'CLOSED'))
);

create index if not exists support_tickets_user_idx on support_tickets (user_id, created_at desc);
create index if not exists support_tickets_status_idx on support_tickets (status);

create table if not exists support_messages (
  id text primary key,
  ticket_id text not null references support_tickets (id) on delete cascade,
  sender_type text not null,
  sender_id text,
  body text not null,
  created_at timestamptz not null default now(),
  constraint support_sender_chk check (sender_type in ('USER', 'ADMIN', 'SYSTEM'))
);

create index if not exists support_messages_ticket_idx on support_messages (ticket_id, created_at);

create table if not exists jobs (
  id text primary key,
  title_i18n jsonb not null,
  description_i18n jsonb not null,
  payment_text text,
  requirements text,
  location text,
  schedule text,
  status text not null default 'ACTIVE',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint jobs_status_chk check (status in ('ACTIVE', 'HIDDEN', 'CLOSED'))
);

create table if not exists job_applications (
  id text primary key,
  job_id text not null references jobs (id),
  user_id text not null references shop_users (id),
  message text,
  status text not null default 'PENDING',
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint job_app_status_chk check (status in ('PENDING', 'APPROVED', 'REJECTED', 'CONTACTED'))
);

create table if not exists pages (
  id text primary key,
  slug text not null unique,
  title_i18n jsonb not null,
  body_i18n jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

create table if not exists notifications (
  id text primary key,
  type text not null,
  title text not null,
  body text,
  entity_type text,
  entity_id text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_unread_idx on notifications (read_at, created_at desc);

create table if not exists referrals (
  id text primary key,
  referrer_id text not null references shop_users (id),
  referee_id text not null references shop_users (id),
  amount_cents integer not null default 0,
  status text not null default 'PENDING',
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id text primary key,
  actor_id text,
  actor_type text not null,
  action text not null,
  entity text,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  ip text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on audit_logs (created_at desc);
create index if not exists audit_logs_entity_idx on audit_logs (entity, entity_id);

create table if not exists bot_accounts (
  id text primary key,
  kind text not null unique,
  username text,
  token_set boolean not null default false,
  webhook_url text,
  last_webhook_at timestamptz,
  last_update_at timestamptz,
  last_error text,
  status text not null default 'OFFLINE',
  updated_at timestamptz not null default now(),
  constraint bot_accounts_kind_chk check (kind in ('main', 'payment', 'courier'))
);

create table if not exists bot_sessions (
  id text primary key,
  bot text not null,
  telegram_id bigint not null,
  user_id text,
  courier_id text,
  language text not null default 'ru',
  state text not null default 'MAIN',
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (bot, telegram_id)
);

create table if not exists bot_messages (
  id text primary key,
  bot text not null,
  telegram_id bigint not null,
  direction text not null,
  text text,
  payload jsonb,
  created_at timestamptz not null default now(),
  constraint bot_messages_dir_chk check (direction in ('IN', 'OUT'))
);

create index if not exists bot_messages_thread_idx on bot_messages (bot, telegram_id, created_at);

create table if not exists personal_bots (
  id text primary key,
  user_id text not null references shop_users (id),
  username text,
  token_fingerprint text,
  status text not null default 'PENDING',
  last_check_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  constraint personal_bots_status_chk check (status in ('PENDING', 'CONNECTED', 'ERROR', 'DISABLED'))
);

create table if not exists system_errors (
  id text primary key,
  level text not null default 'ERROR',
  service text,
  event text,
  message text not null,
  request_id text,
  context_json jsonb,
  created_at timestamptz not null default now(),
  constraint system_errors_level_chk check (level in ('ERROR', 'WARNING', 'INFO'))
);

create index if not exists system_errors_created_idx on system_errors (created_at desc);

create table if not exists exchange_rates (
  code text primary key,
  rate_to_usd numeric not null,
  updated_at timestamptz not null default now()
);
