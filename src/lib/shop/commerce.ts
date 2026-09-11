import { asInt, asJson, many, one, sql as getSql, type Row } from "./db";
import { nid, nextPublicCode } from "./ids";
import { applyDiscounts, formatMoney } from "./money";
import { audit, notify } from "./audit";
import { publish } from "./events";
import { pickI18n } from "./i18n";
import type { Lang } from "./types";
import { canTransition } from "./workflow";

export { canTransition };

export async function listCategories() {
  const db = await getSql();
  return many(
    db,
    `select * from categories where status='ACTIVE' order by sort_order, created_at`,
  );
}

export async function listPublishedProducts(opts: {
  categoryId?: string | null;
  special?: "new" | "popular" | "sale" | null;
  lang: Lang;
}) {
  const db = await getSql();
  const params: unknown[] = [];
  const where = [
    `p.deleted_at is null`,
    `p.published = true`,
    `p.status = 'ACTIVE'`,
    `p.moderation_status = 'APPROVED'`,
  ];
  if (opts.categoryId) {
    params.push(opts.categoryId);
    where.push(`p.category_id=$${params.length}`);
  }
  if (opts.special === "sale") where.push(`p.discount_percent > 0`);
  if (opts.special === "popular") {
    return many(
      db,
      `select p.*, c.slug as category_slug, c.name_i18n as category_name,
              (select url from product_images i where i.product_id=p.id order by is_primary desc, sort_order limit 1) as image_url
       from products p left join categories c on c.id=p.category_id
       where ${where.join(" and ")}
       order by p.purchases_count desc, p.created_at desc
       limit 50`,
      params,
    );
  }
  if (opts.special === "new") {
    return many(
      db,
      `select p.*, c.slug as category_slug, c.name_i18n as category_name,
              (select url from product_images i where i.product_id=p.id order by is_primary desc, sort_order limit 1) as image_url
       from products p left join categories c on c.id=p.category_id
       where ${where.join(" and ")}
       order by p.created_at desc
       limit 50`,
      params,
    );
  }
  return many(
    db,
    `select p.*, c.slug as category_slug, c.name_i18n as category_name,
            (select url from product_images i where i.product_id=p.id order by is_primary desc, sort_order limit 1) as image_url
     from products p left join categories c on c.id=p.category_id
     where ${where.join(" and ")}
     order by p.sort_order, p.created_at desc`,
    params,
  );
}

export async function getProduct(id: string): Promise<(Row & { images: Row[] }) | null> {
  const db = await getSql();
  const product = await one(db, `select * from products where id=$1 and deleted_at is null`, [id]);
  if (!product) return null;
  const images = await many(db, `select * from product_images where product_id=$1 order by is_primary desc, sort_order`, [id]);
  return { ...product, images };
}

export function productTitle(row: Record<string, unknown>, lang: Lang): string {
  return pickI18n(asJson(row.name_i18n, {}), lang) || String(row.slug ?? "");
}

export async function quotePrice(productId: string, userId: string) {
  const db = await getSql();
  const product = await one<{
    id: string;
    price_cents: number;
    discount_percent: number;
    stock: number;
    status: string;
    published: boolean;
    moderation_status: string;
    deleted_at: string | null;
    name_i18n: unknown;
  }>(db, `select * from products where id=$1`, [productId]);
  const user = await one<{ discount_percent: number; balance_cents: number; status: string; language: Lang }>(
    db,
    `select discount_percent, balance_cents, status, language from shop_users where id=$1`,
    [userId],
  );
  if (!product || product.deleted_at) return { ok: false as const, error: "MISSING" };
  if (!user) return { ok: false as const, error: "NO_USER" };
  if (user.status === "BLOCKED") return { ok: false as const, error: "BLOCKED" };
  const sellable =
    product.published &&
    product.status === "ACTIVE" &&
    product.moderation_status === "APPROVED" &&
    asInt(product.stock) > 0;
  if (!sellable) return { ok: false as const, error: "UNAVAILABLE" };
  const { unitCents } = applyDiscounts(
    asInt(product.price_cents),
    asInt(product.discount_percent),
    asInt(user.discount_percent),
  );
  return {
    ok: true as const,
    unitCents,
    listCents: asInt(product.price_cents),
    stock: asInt(product.stock),
    balance: asInt(user.balance_cents),
    need: Math.max(0, unitCents - asInt(user.balance_cents)),
    language: user.language,
    name: productTitle(product, user.language),
  };
}

export async function purchaseProduct(opts: {
  userId: string;
  productId: string;
}): Promise<
  | { ok: true; orderId: string; code: string; total: number; balance: number }
  | { ok: false; error: string; quote?: Awaited<ReturnType<typeof quotePrice>> }
> {
  const quote = await quotePrice(opts.productId, opts.userId);
  if (!quote.ok) return { ok: false, error: quote.error, quote };
  if (quote.balance < quote.unitCents) return { ok: false, error: "INSUFFICIENT", quote };

  const db = await getSql();
  const stock = await one<{ id: string; stock: number; name_i18n: unknown; price_cents: number }>(
    db,
    `update products
     set stock = stock - 1,
         purchases_count = purchases_count + 1,
         status = case when stock - 1 <= 0 then 'OUT_OF_STOCK' else status end,
         updated_at=now()
     where id=$1 and published=true and status='ACTIVE' and moderation_status='APPROVED' and stock >= 1 and deleted_at is null
     returning id, stock, name_i18n, price_cents`,
    [opts.productId],
  );
  if (!stock) return { ok: false, error: "UNAVAILABLE", quote };

  const paid = await one<{ balance_cents: number }>(
    db,
    `update shop_users
     set balance_cents = balance_cents - $2, purchases_count = purchases_count + 1, updated_at=now()
     where id=$1 and status <> 'BLOCKED' and balance_cents >= $2
     returning balance_cents`,
    [opts.userId, quote.unitCents],
  );
  if (!paid) {
    await db.query(
      `update products set stock = stock + 1, purchases_count = purchases_count - 1,
              status = case when stock + 1 > 0 and status='OUT_OF_STOCK' then 'ACTIVE' else status end,
              updated_at=now() where id=$1`,
      [opts.productId],
    );
    return { ok: false, error: "INSUFFICIENT", quote };
  }

  const after = asInt(paid.balance_cents);
  const orderId = nid("ord");
  const code = await nextPublicCode(db, "ORD");
  const name = productTitle(stock, "ru");
  await db.query(
    `insert into orders (id, public_code, user_id, status, subtotal_cents, discount_cents, total_cents, paid_at)
     values ($1,$2,$3,'PAID',$4,$5,$6,now())`,
    [orderId, code, opts.userId, asInt(stock.price_cents), asInt(stock.price_cents) - quote.unitCents, quote.unitCents],
  );
  await db.query(
    `insert into order_items (id, order_id, product_id, product_name, unit_price_cents, quantity, total_cents)
     values ($1,$2,$3,$4,$5,1,$5)`,
    [nid("oit"), orderId, opts.productId, name, quote.unitCents],
  );
  await db.query(
    `insert into order_events (id, order_id, from_status, to_status, actor_type, actor_id, note)
     values ($1,$2,'NEW','PAID','USER',$3,'Покупка с баланса')`,
    [nid("oev"), orderId, opts.userId],
  );
  await db.query(
    `insert into ledger_transactions
      (id, user_id, amount_cents, type, balance_before, balance_after, reference_id, reason)
     values ($1,$2,$3,'PURCHASE',$4,$5,$6,$7)`,
    [nid("txn"), opts.userId, -quote.unitCents, after + quote.unitCents, after, orderId, `Заказ ${code}`],
  );
  await notify({
    type: "NEW_ORDER",
    title: `Заказ ${code}`,
    body: formatMoney(quote.unitCents),
    entityType: "order",
    entityId: orderId,
  });
  publish({
    type: "NEW_ORDER",
    title: `Создан заказ ${code}`,
    body: name,
    entityType: "order",
    entityId: orderId,
  });
  return { ok: true, orderId, code, total: quote.unitCents, balance: after };
}

export async function setOrderStatus(opts: {
  orderId: string;
  to: string;
  actorType: "ADMIN" | "SYSTEM" | "COURIER";
  actorId?: string;
  note?: string;
}) {
  const db = await getSql();
  const order = await one<{ id: string; status: string; user_id: string; total_cents: number; public_code: string }>(
    db,
    `select id, status, user_id, total_cents, public_code from orders where id=$1`,
    [opts.orderId],
  );
  if (!order) return { ok: false as const, error: "NOT_FOUND" };
  if (order.status === opts.to) return { ok: true as const, duplicate: true };
  if (!canTransition(order.status, opts.to) && opts.actorType === "ADMIN" && opts.to !== order.status) {
    // Admin may force-forward along known graph only.
    if (!canTransition(order.status, opts.to)) return { ok: false as const, error: "ILLEGAL" };
  }
  if (opts.to === "REFUNDED") {
    const refunded = await one(
      db,
      `select id from ledger_transactions where reference_id=$1 and type='REFUND'`,
      [order.id],
    );
    if (!refunded) {
      const moved = await one<{ balance_cents: number }>(
        db,
        `update shop_users set balance_cents = balance_cents + $2, updated_at=now() where id=$1 returning balance_cents`,
        [order.user_id, order.total_cents],
      );
      const after = asInt(moved?.balance_cents);
      await db.query(
        `insert into ledger_transactions
          (id, user_id, amount_cents, type, balance_before, balance_after, reference_id, reason, admin_id)
         values ($1,$2,$3,'REFUND',$4,$5,$6,'Order refund',$7)`,
        [nid("txn"), order.user_id, order.total_cents, after - order.total_cents, after, order.id, opts.actorId ?? null],
      );
    }
  }
  await db.query(`update orders set status=$2, updated_at=now(), completed_at=case when $2 in ('COMPLETED','DELIVERED') then now() else completed_at end, cancelled_at=case when $2='CANCELLED' then now() else cancelled_at end where id=$1`, [
    order.id,
    opts.to,
  ]);
  await db.query(
    `insert into order_events (id, order_id, from_status, to_status, actor_type, actor_id, note)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [nid("oev"), order.id, order.status, opts.to, opts.actorType, opts.actorId ?? null, opts.note ?? null],
  );
  await audit(null, {
    actorId: opts.actorId,
    actorType: opts.actorType === "ADMIN" ? "ADMIN" : opts.actorType === "COURIER" ? "COURIER" : "SYSTEM",
    action: "order.status",
    entity: "order",
    entityId: order.id,
    oldValue: { status: order.status },
    newValue: { status: opts.to },
  });
  return { ok: true as const };
}

export async function saveProduct(opts: {
  adminId: string;
  id?: string;
  payload: Record<string, unknown>;
}) {
  const db = await getSql();
  const id = opts.id ?? nid("prd");
  const slug =
    String(opts.payload.slug ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-|-$/g, "") || id.slice(-8);
  const name = opts.payload.name_i18n ?? { en: String(opts.payload.name ?? "Untitled") };
  const exists = opts.id
    ? await one<{ id: string }>(db, `select id from products where id=$1`, [opts.id])
    : null;
  if (!exists) {
    await db.query(
      `insert into products (
         id, slug, name_i18n, description_i18n, short_description_i18n, specs_i18n,
         price_cents, old_price_cents, discount_percent, category_id, stock,
         status, published, featured, sort_order, moderation_status, created_by
       ) values ($1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15,'APPROVED',$16)`,
      [
        id,
        slug,
        JSON.stringify(name),
        JSON.stringify(opts.payload.description_i18n ?? {}),
        JSON.stringify(opts.payload.short_description_i18n ?? {}),
        JSON.stringify(opts.payload.specs_i18n ?? {}),
        asInt(opts.payload.price_cents),
        opts.payload.old_price_cents == null ? null : asInt(opts.payload.old_price_cents),
        asInt(opts.payload.discount_percent),
        opts.payload.category_id ?? null,
        asInt(opts.payload.stock),
        String(opts.payload.status ?? "DRAFT"),
        Boolean(opts.payload.published),
        Boolean(opts.payload.featured),
        asInt(opts.payload.sort_order),
        opts.adminId,
      ],
    );
    await audit(db, { actorId: opts.adminId, actorType: "ADMIN", action: "product.create", entity: "product", entityId: id });
  } else {
    await db.query(
      `update products set
         slug=$2, name_i18n=$3::jsonb, description_i18n=$4::jsonb, short_description_i18n=$5::jsonb,
         specs_i18n=$6::jsonb, price_cents=$7, old_price_cents=$8, discount_percent=$9,
         category_id=$10, stock=$11, status=$12, published=$13, featured=$14, sort_order=$15, updated_at=now()
       where id=$1`,
      [
        id,
        slug,
        JSON.stringify(name),
        JSON.stringify(opts.payload.description_i18n ?? {}),
        JSON.stringify(opts.payload.short_description_i18n ?? {}),
        JSON.stringify(opts.payload.specs_i18n ?? {}),
        asInt(opts.payload.price_cents),
        opts.payload.old_price_cents == null ? null : asInt(opts.payload.old_price_cents),
        asInt(opts.payload.discount_percent),
        opts.payload.category_id ?? null,
        asInt(opts.payload.stock),
        String(opts.payload.status ?? "DRAFT"),
        Boolean(opts.payload.published),
        Boolean(opts.payload.featured),
        asInt(opts.payload.sort_order),
      ],
    );
    await audit(db, { actorId: opts.adminId, actorType: "ADMIN", action: "product.edit", entity: "product", entityId: id });
  }
  if (typeof opts.payload.image_url === "string" && opts.payload.image_url) {
    await db.query(`update product_images set is_primary=false where product_id=$1`, [id]);
    await db.query(
      `insert into product_images (id, product_id, url, is_primary, sort_order) values ($1,$2,$3,true,0)`,
      [nid("img"), id, opts.payload.image_url],
    );
  }
  return { id };
}

export async function addReview(opts: {
  userId: string;
  orderId: string;
  rating: number;
  body?: string;
}) {
  const db = await getSql();
  if (opts.rating < 1 || opts.rating > 5) return { ok: false as const, error: "RATING" };
  const order = await one<{ id: string; status: string; user_id: string }>(
    db,
    `select id, status, user_id from orders where id=$1`,
    [opts.orderId],
  );
  if (!order || order.user_id !== opts.userId) return { ok: false as const, error: "NOT_FOUND" };
  if (!["DELIVERED", "COMPLETED"].includes(order.status)) return { ok: false as const, error: "NOT_COMPLETE" };
  const dup = await one(db, `select id from reviews where order_id=$1 and user_id=$2`, [opts.orderId, opts.userId]);
  if (dup) return { ok: false as const, error: "EXISTS" };
  const item = await one<{ product_id: string }>(db, `select product_id from order_items where order_id=$1 limit 1`, [
    opts.orderId,
  ]);
  const id = nid("rev");
  await db.query(
    `insert into reviews (id, user_id, order_id, product_id, rating, body, status)
     values ($1,$2,$3,$4,$5,$6,'PENDING')`,
    [id, opts.userId, opts.orderId, item?.product_id ?? null, opts.rating, opts.body ?? ""],
  );
  if (item?.product_id) {
    await db.query(
      `update products set rating_sum = rating_sum + $2, rating_count = rating_count + 1 where id=$1`,
      [item.product_id, opts.rating],
    );
  }
  return { ok: true as const, id };
}
