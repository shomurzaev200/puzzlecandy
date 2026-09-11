-- Unique pay amounts, requisites snapshot, expanded payment statuses, KYC, user public codes.

alter table payments add column if not exists pay_amount_cents integer;
alter table payments add column if not exists method_id text;
alter table payments add column if not exists requisites_snapshot jsonb;
alter table payments add column if not exists submitted_at timestamptz;
alter table payments add column if not exists expires_at timestamptz;
alter table payments add column if not exists idempotency_key text;

update payments set pay_amount_cents = amount_cents where pay_amount_cents is null;

with numbered as (
  select id, amount_cents,
         row_number() over (partition by amount_cents order by created_at) as rn
    from payments
   where status in ('PENDING', 'SUBMITTED', 'UNDER_REVIEW')
)
update payments p
   set pay_amount_cents = n.amount_cents + (n.rn - 1)
  from numbered n
 where p.id = n.id;

alter table payments drop constraint if exists payments_status_chk;
alter table payments add constraint payments_status_chk check (status in (
  'PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED', 'CANCELLED'
));

create unique index if not exists payments_pending_pay_amount_uidx
  on payments (pay_amount_cents)
  where status in ('PENDING', 'SUBMITTED', 'UNDER_REVIEW');

create unique index if not exists payments_idempotency_uidx
  on payments (idempotency_key)
  where idempotency_key is not null;

create table if not exists payment_methods (
  id text primary key,
  title text not null,
  kind text not null default 'CARD',
  details text not null,
  comment text,
  status text not null default 'ACTIVE',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_methods_kind_chk check (kind in ('CARD', 'CRYPTO', 'BANK', 'OTHER')),
  constraint payment_methods_status_chk check (status in ('ACTIVE', 'HIDDEN'))
);

create table if not exists kyc_submissions (
  id text primary key,
  public_code text not null unique,
  user_id text not null references shop_users (id),
  first_name text,
  last_name text,
  patronymic text,
  birth_date text,
  document_file_id text,
  document_url text,
  video_file_id text,
  video_url text,
  status text not null default 'DRAFT',
  reject_reason text,
  reviewed_by text,
  reviewed_at timestamptz,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kyc_status_chk check (status in ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'REJECTED'))
);

create index if not exists kyc_status_idx on kyc_submissions (status, created_at desc);
create index if not exists kyc_user_idx on kyc_submissions (user_id, created_at desc);

alter table shop_users add column if not exists public_code text;
alter table shop_users add column if not exists kyc_status text not null default 'NONE';
create unique index if not exists shop_users_public_code_uidx on shop_users (public_code) where public_code is not null;
create index if not exists shop_users_username_idx on shop_users (username);
create index if not exists ledger_user_idx on ledger_transactions (user_id, created_at desc);
create index if not exists ledger_ref_idx on ledger_transactions (reference_id);

alter table admins drop constraint if exists admins_role_chk;
alter table admins add constraint admins_role_chk check (role in (
  'SUPER_ADMIN',
  'ADMIN',
  'MODERATOR',
  'SUPPORT',
  'FINANCE',
  'COURIER_MANAGER',
  'FINANCE_ADMIN',
  'ORDER_OPERATOR',
  'COURIER_DISPATCHER',
  'SUPPORT_AGENT',
  'KYC_REVIEWER',
  'MANAGER'
));
