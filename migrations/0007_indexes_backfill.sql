-- Extra indexes, user public codes, default payment method.

create index if not exists payments_status_idx on payments (status, created_at desc);
create index if not exists payments_user_idx on payments (user_id, created_at desc);
create index if not exists orders_user_idx on orders (user_id, created_at desc);
create index if not exists orders_status_idx on orders (status, created_at desc);
create index if not exists products_category_idx on products (category_id) where deleted_at is null;

with numbered as (
  select id, row_number() over (order by registered_at, id) as n
    from shop_users
   where public_code is null
)
update shop_users u
   set public_code = 'USER-' || to_char(coalesce(u.registered_at, now()), 'YYYYMMDD') || '-' || lpad(n.n::text, 6, '0')
  from numbered n
 where u.id = n.id;

insert into payment_methods (id, title, kind, details, comment, status, sort_order)
values (
  'pm_default_card',
  'Uzcard',
  'CARD',
  'XXXX XXXX XXXX XXXX',
  'Переведите точную «сумму к оплате» одним платежом и отправьте скриншот.',
  'ACTIVE',
  0
)
on conflict (id) do nothing;
