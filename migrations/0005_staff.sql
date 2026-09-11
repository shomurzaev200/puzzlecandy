-- Staff RBAC expansion: extra roles, must-change-password, ACCESS_DENIED-ready.

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
  'SUPPORT_AGENT'
));

alter table admins add column if not exists must_change_password boolean not null default false;
