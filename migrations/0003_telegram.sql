-- Telegram connections managed from the admin panel (bots + user accounts).

alter table bot_accounts drop constraint if exists bot_accounts_kind_chk;
alter table bot_accounts drop constraint if exists bot_accounts_kind_key;

alter table bot_accounts add column if not exists title text;
alter table bot_accounts add column if not exists telegram_id bigint;
alter table bot_accounts add column if not exists token_fingerprint text;
alter table bot_accounts add column if not exists last_check_at timestamptz;
alter table bot_accounts add column if not exists purpose text;

alter table bot_accounts add constraint bot_accounts_kind_chk
  check (kind in ('main', 'payment', 'courier', 'support', 'other'));

create unique index if not exists bot_accounts_named_kind_uidx
  on bot_accounts (kind) where kind in ('main', 'payment', 'courier', 'support');

create table if not exists bot_secrets (
  bot_id text primary key references bot_accounts (id) on delete cascade,
  token_enc text not null,
  updated_at timestamptz not null default now()
);

create table if not exists telegram_user_accounts (
  id text primary key,
  display_name text,
  username text,
  telegram_id bigint,
  photo_url text,
  phone_masked text,
  purpose text not null default 'other',
  status text not null default 'NEED_AUTH',
  session_set boolean not null default false,
  last_activity_at timestamptz,
  last_check_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tg_acc_purpose_chk check (purpose in ('payment', 'operator', 'courier', 'support', 'work', 'other')),
  constraint tg_acc_status_chk check (status in ('CONNECTED', 'CHECKING', 'NEED_AUTH', 'ERROR', 'DISABLED'))
);

create table if not exists telegram_auth_sessions (
  id text primary key,
  method text not null,
  phone text,
  purpose text,
  status text not null default 'PENDING',
  qr_payload text,
  code_hash text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_account_id text,
  constraint tg_auth_method_chk check (method in ('qr', 'phone')),
  constraint tg_auth_status_chk check (status in ('PENDING', 'CODE_SENT', 'NEED_2FA', 'CONNECTED', 'EXPIRED', 'ERROR'))
);

create index if not exists telegram_auth_sessions_exp_idx on telegram_auth_sessions (expires_at);
