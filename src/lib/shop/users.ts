import { asInt, many, one, sql as getSql } from "./db";
import { nid, referralCode } from "./ids";
import { audit, notify } from "./audit";
import { publish } from "./events";
import type { Lang, ShopUserRow } from "./types";

export async function upsertShopUser(opts: {
  telegramId: number;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  language?: Lang;
  startPayload?: string | null;
}): Promise<ShopUserRow> {
  const db = await getSql();
  const existing = await one<ShopUserRow>(
    db,
    `select * from shop_users where telegram_id=$1`,
    [opts.telegramId],
  );
  if (existing) {
    await db.query(
      `update shop_users set
         username=coalesce($2, username),
         first_name=coalesce($3, first_name),
         last_name=coalesce($4, last_name),
         last_activity_at=now(),
         updated_at=now()
       where id=$1`,
      [existing.id, opts.username ?? null, opts.firstName ?? null, opts.lastName ?? null],
    );
    return { ...existing, username: opts.username ?? existing.username, first_name: opts.firstName ?? existing.first_name };
  }
  const id = nid("usr");
  let referredBy: string | null = null;
  if (opts.startPayload) {
    const ref = await one<{ id: string }>(db, `select id from shop_users where referral_code=$1`, [
      opts.startPayload.toUpperCase(),
    ]);
    if (ref) referredBy = ref.id;
  }
  const row = await one<ShopUserRow>(
    db,
    `insert into shop_users
      (id, telegram_id, username, first_name, last_name, language, referral_code, referred_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8)
     returning *`,
    [
      id,
      opts.telegramId,
      opts.username ?? null,
      opts.firstName ?? null,
      opts.lastName ?? null,
      opts.language ?? "ru",
      referralCode(),
      referredBy,
    ],
  );
  if (!row) throw new Error("Failed to create user");
  if (referredBy) {
    await db.query(`update shop_users set referrals_count = referrals_count + 1 where id=$1`, [referredBy]);
  }
  await notify({ type: "NEW_USER", title: "Новый пользователь", body: opts.username || String(opts.telegramId), entityType: "user", entityId: id });
  publish({ type: "NEW_USER", title: "Новый пользователь", body: opts.firstName || opts.username || String(opts.telegramId), entityType: "user", entityId: id });
  return row;
}

export async function setLanguage(userId: string, language: Lang) {
  const db = await getSql();
  await db.query(`update shop_users set language=$2, updated_at=now() where id=$1`, [userId, language]);
}

export async function setUserStatus(opts: { userId: string; status: "ACTIVE" | "BLOCKED" | "VIP"; adminId: string }) {
  const db = await getSql();
  const prev = await one<{ status: string }>(db, `select status from shop_users where id=$1`, [opts.userId]);
  await db.query(`update shop_users set status=$2, updated_at=now() where id=$1`, [opts.userId, opts.status]);
  await audit(db, {
    actorId: opts.adminId,
    actorType: "ADMIN",
    action: opts.status === "BLOCKED" ? "user.block" : opts.status === "ACTIVE" ? "user.unblock" : "user.status",
    entity: "user",
    entityId: opts.userId,
    oldValue: prev,
    newValue: { status: opts.status },
  });
}

export async function setDiscount(opts: { userId: string; percent: number; adminId: string }) {
  const db = await getSql();
  const p = Math.min(90, Math.max(0, Math.round(opts.percent)));
  await db.query(`update shop_users set discount_percent=$2, updated_at=now() where id=$1`, [opts.userId, p]);
  await audit(db, {
    actorId: opts.adminId,
    actorType: "ADMIN",
    action: "user.discount",
    entity: "user",
    entityId: opts.userId,
    newValue: { percent: p },
  });
}

export async function searchUsers(opts: {
  q?: string;
  status?: string;
  filter?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getSql();
  const params: unknown[] = [];
  const where = ["1=1"];
  if (opts.q) {
    params.push(`%${opts.q.replaceAll("%", "")}%`);
    const i = params.length;
    where.push(
      `(username ilike $${i} or coalesce(first_name,'') ilike $${i} or referral_code ilike $${i} or cast(telegram_id as text) ilike $${i} or id ilike $${i})`,
    );
  }
  if (opts.status && opts.status !== "ALL") {
    params.push(opts.status);
    where.push(`status=$${params.length}`);
  }
  if (opts.filter === "Has balance") where.push(`balance_cents > 0`);
  if (opts.filter === "Has orders") where.push(`purchases_count > 0`);
  if (opts.filter === "New") where.push(`registered_at > now() - interval '24 hours'`);
  if (opts.filter === "VIP") where.push(`status='VIP' or discount_percent >= 10`);
  params.push(Math.min(opts.limit ?? 50, 200), opts.offset ?? 0);
  return many(
    db,
    `select * from shop_users where ${where.join(" and ")} order by registered_at desc limit $${params.length - 1} offset $${params.length}`,
    params,
  );
}

export async function dealsCount(): Promise<number> {
  const db = await getSql();
  const row = await one<{ n: number }>(db, `select count(*)::int as n from orders where status not in ('CANCELLED')`);
  return asInt(row?.n);
}
