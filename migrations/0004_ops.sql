-- PUZZLECANDY ops layer (blocks 76–135). Additive tables only.

create table if not exists ops_claims (
  entity_type text not null,
  entity_id text not null,
  admin_id text not null,
  admin_name text,
  claimed_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (entity_type, entity_id)
);

create table if not exists ops_presence (
  entity_type text not null,
  entity_id text not null,
  admin_id text not null,
  admin_name text,
  last_seen timestamptz not null default now(),
  primary key (entity_type, entity_id, admin_id)
);

create table if not exists entity_tags (
  id text primary key,
  entity_type text not null,
  entity_id text not null,
  tag text not null,
  created_by text,
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id, tag)
);

create index if not exists entity_tags_lookup_idx on entity_tags (entity_type, entity_id);

create table if not exists entity_notes (
  id text primary key,
  entity_type text not null,
  entity_id text not null,
  body text not null,
  visibility text not null default 'INTERNAL',
  author_id text,
  author_name text,
  created_at timestamptz not null default now(),
  constraint entity_notes_vis_chk check (visibility in ('INTERNAL', 'CUSTOMER', 'SYSTEM'))
);

create index if not exists entity_notes_lookup_idx on entity_notes (entity_type, entity_id, created_at);

create table if not exists canned_responses (
  id text primary key,
  title text not null,
  body text not null,
  scope text not null default 'TEAM',
  owner_id text,
  created_at timestamptz not null default now(),
  constraint canned_scope_chk check (scope in ('TEAM', 'PERSONAL'))
);

create table if not exists ops_snooze (
  id text primary key,
  entity_type text not null,
  entity_id text not null,
  admin_id text not null,
  until_at timestamptz not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists ops_snooze_until_idx on ops_snooze (until_at);

create table if not exists admin_pins (
  admin_id text not null,
  kind text not null,
  entity_type text not null,
  entity_id text not null,
  label text,
  href text,
  created_at timestamptz not null default now(),
  primary key (admin_id, kind, entity_type, entity_id),
  constraint admin_pins_kind_chk check (kind in ('recent', 'favorite', 'pin'))
);

create table if not exists refunds (
  id text primary key,
  public_code text not null unique,
  order_id text,
  user_id text not null,
  amount_cents integer not null,
  status text not null default 'REQUESTED',
  reason text,
  requested_by text,
  approved_by text,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint refunds_amount_chk check (amount_cents > 0),
  constraint refunds_status_chk check (status in ('REQUESTED', 'APPROVED', 'PROCESSING', 'DONE', 'REJECTED'))
);

create index if not exists refunds_status_idx on refunds (status, created_at desc);

create table if not exists promo_codes (
  id text primary key,
  code text not null unique,
  kind text not null,
  value_cents integer not null default 0,
  percent integer not null default 0,
  max_uses integer,
  used_count integer not null default 0,
  min_order_cents integer not null default 0,
  segment text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'ACTIVE',
  created_by text,
  created_at timestamptz not null default now(),
  constraint promo_kind_chk check (kind in ('PERCENT', 'FIXED', 'FREE_DELIVERY')),
  constraint promo_status_chk check (status in ('ACTIVE', 'DISABLED', 'EXPIRED'))
);

create table if not exists promo_redemptions (
  id text primary key,
  promo_id text not null references promo_codes (id),
  user_id text not null,
  order_id text,
  saved_cents integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists courier_payouts (
  id text primary key,
  courier_id text not null,
  kind text not null,
  amount_cents integer not null,
  reason text,
  admin_id text,
  created_at timestamptz not null default now(),
  constraint payout_kind_chk check (kind in ('ACCRUAL', 'BONUS', 'PENALTY', 'PAYOUT'))
);

create index if not exists courier_payouts_courier_idx on courier_payouts (courier_id, created_at desc);

create table if not exists risk_flags (
  id text primary key,
  entity_type text not null,
  entity_id text not null,
  flag text not null,
  reason text,
  created_by text,
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id, flag),
  constraint risk_flag_chk check (flag in ('blacklist', 'watchlist', 'trusted'))
);

create table if not exists broadcasts (
  id text primary key,
  segment text not null,
  body text not null,
  status text not null default 'DRAFT',
  scheduled_at timestamptz,
  sent_at timestamptz,
  sent_count integer not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  constraint broadcast_status_chk check (status in ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'CANCELLED'))
);

create table if not exists api_keys (
  id text primary key,
  name text not null,
  prefix text not null,
  hash text not null,
  scopes text not null default 'read:orders',
  ip_allow text,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists outbound_webhooks (
  id text primary key,
  url text not null,
  events text not null,
  secret text,
  status text not null default 'ACTIVE',
  created_by text,
  created_at timestamptz not null default now(),
  constraint webhook_status_chk check (status in ('ACTIVE', 'DISABLED'))
);

create table if not exists webhook_deliveries (
  id text primary key,
  webhook_id text not null,
  event_type text not null,
  payload_json jsonb not null,
  status text not null,
  response_code integer,
  created_at timestamptz not null default now()
);

create table if not exists automation_rules (
  id text primary key,
  name text not null,
  if_json jsonb not null,
  then_json jsonb not null,
  enabled boolean not null default true,
  last_fired_at timestamptz,
  fire_count integer not null default 0,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists approval_items (
  id text primary key,
  kind text not null,
  title text not null,
  amount_cents integer,
  payload_json jsonb,
  requested_by text,
  status text not null default 'PENDING',
  decided_by text,
  comment text,
  created_at timestamptz not null default now(),
  constraint approval_status_chk check (status in ('PENDING', 'APPROVED', 'REJECTED'))
);

create table if not exists shift_handovers (
  id text primary key,
  from_admin text not null,
  to_admin text,
  report_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists ops_undo (
  id text primary key,
  admin_id text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  payload_json jsonb not null,
  expires_at timestamptz not null,
  undone_at timestamptz
);

create table if not exists import_jobs (
  id text primary key,
  kind text not null,
  filename text,
  result_json jsonb,
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists column_presets (
  id text primary key,
  admin_id text not null,
  table_key text not null,
  name text not null,
  columns_json jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists saved_views (
  id text primary key,
  admin_id text not null,
  table_key text not null,
  name text not null,
  filter_json jsonb not null,
  created_at timestamptz not null default now()
);
