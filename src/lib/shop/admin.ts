import { asInt, many, one, sql as getSql } from "./db";
import { nid } from "./ids";
import { permissionsFor } from "./rbac";
import type { AdminRole, Permission } from "./types";
import { ensureSeed } from "./seed";
import { audit } from "./audit";

export type AdminActor = {
  id: string;
  userId: string;
  email: string | null;
  name: string | null;
  role: AdminRole;
  permissions: Permission[];
};

export async function requireAdmin(userId: string, permission?: Permission): Promise<AdminActor> {
  await ensureSeed();
  const db = await getSql();
  const authUser = await one<{ id: string; email: string; name: string }>(
    db,
    `select id, email, name from "user" where id=$1`,
    [userId],
  );
  const count = await one<{ n: number }>(db, `select count(*)::int as n from admins`);
  if (asInt(count?.n) === 0) {
    const id = nid("adm");
    await db.query(
      `insert into admins (id, user_id, email, name, role, status, last_login_at)
       values ($1,$2,$3,$4,'SUPER_ADMIN','ACTIVE', now())`,
      [id, userId, authUser?.email ?? null, authUser?.name ?? "Owner"],
    );
    await audit(db, {
      actorId: userId,
      actorType: "ADMIN",
      action: "admin.bootstrap",
      entity: "admin",
      entityId: id,
    });
  }
  const admin = await one<{
    id: string;
    user_id: string;
    email: string | null;
    name: string | null;
    role: AdminRole;
    status: string;
  }>(db, `select * from admins where user_id=$1`, [userId]);
  if (!admin || admin.status !== "ACTIVE") {
    const err = new Error("Forbidden");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  await db.query(`update admins set last_login_at=now() where id=$1`, [admin.id]);
  const extra = await many<{ permission: Permission }>(
    db,
    `select permission from role_permissions where role=$1`,
    [admin.role],
  );
  const permissions = extra.length ? extra.map((r) => r.permission) : permissionsFor(admin.role);
  if (permission && !permissions.includes(permission) && admin.role !== "SUPER_ADMIN") {
    const err = new Error("Forbidden");
    (err as Error & { status?: number }).status = 403;
    throw err;
  }
  return {
    id: admin.id,
    userId: admin.user_id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    permissions,
  };
}

export async function dashboardStats() {
  const db = await getSql();
  const q = async (text: string) => asInt((await one<{ n: number }>(db, text))?.n);
  const [
    users,
    activeUsers,
    newToday,
    orders,
    ordersToday,
    revenue,
    pendingPay,
    pendingDel,
    products,
    out,
    pendingTickets,
    offlineBots,
    errorCount,
    feed,
    bots,
  ] = await Promise.all([
    q(`select count(*)::int as n from shop_users`),
    q(`select count(*)::int as n from shop_users where last_activity_at > now() - interval '24 hours'`),
    q(`select count(*)::int as n from shop_users where registered_at > now() - interval '24 hours'`),
    q(`select count(*)::int as n from orders`),
    q(`select count(*)::int as n from orders where created_at > now() - interval '24 hours'`),
    q(`select coalesce(sum(total_cents),0)::int as n from orders where status not in ('CANCELLED','REFUNDED')`),
    q(`select count(*)::int as n from payments where status='PENDING'`),
    q(`select count(*)::int as n from courier_reports where status='PENDING_REVIEW'`),
    q(`select count(*)::int as n from products where deleted_at is null and published=true`),
    q(`select count(*)::int as n from products where status='OUT_OF_STOCK' and deleted_at is null`),
    q(`select count(*)::int as n from support_tickets where status in ('OPEN','WAITING')`),
    q(`select count(*)::int as n from bot_accounts where status in ('OFFLINE','ERROR')`),
    q(`select count(*)::int as n from system_errors where created_at > now() - interval '24 hours'`),
    many(
      db,
      `select id, type, title, body, entity_type, entity_id, created_at from notifications order by created_at desc limit 12`,
    ),
    many(db, `select kind, username, status, last_error, last_check_at, last_update_at from bot_accounts order by kind`),
  ]);
  const orderDays = await many<{ d: string; orders: number; revenue: number }>(
    db,
    `select to_char(created_at::date, 'YYYY-MM-DD') as d,
            count(*)::int as orders,
            coalesce(sum(case when status not in ('CANCELLED','REFUNDED') then total_cents else 0 end),0)::int as revenue
     from orders where created_at > now() - interval '14 days'
     group by 1`,
  );
  const depDays = await many<{ d: string; deposits: number }>(
    db,
    `select to_char(created_at::date, 'YYYY-MM-DD') as d, coalesce(sum(amount_cents),0)::int as deposits
     from payments where status='APPROVED' and created_at > now() - interval '14 days' group by 1`,
  );
  const userDays = await many<{ d: string; users: number }>(
    db,
    `select to_char(registered_at::date, 'YYYY-MM-DD') as d, count(*)::int as users
     from shop_users where registered_at > now() - interval '14 days' group by 1`,
  );
  const series = [];
  for (let i = 13; i >= 0; i -= 1) {
    const dt = new Date();
    dt.setDate(dt.getDate() - i);
    const d = dt.toISOString().slice(0, 10);
    series.push({
      d,
      orders: asInt(orderDays.find((r) => r.d === d)?.orders),
      revenue: asInt(orderDays.find((r) => r.d === d)?.revenue),
      deposits: asInt(depDays.find((r) => r.d === d)?.deposits),
      users: asInt(userDays.find((r) => r.d === d)?.users),
    });
  }
  return {
    users,
    activeUsers,
    newToday,
    orders,
    ordersToday,
    revenue,
    pendingPay,
    pendingDel,
    products,
    out,
    pendingTickets,
    offlineBots,
    errorCount,
    feed,
    bots,
    series,
  };
}

export async function listAdmins() {
  const db = await getSql();
  return many(db, `select id, user_id, email, name, role, status, created_at, last_login_at from admins order by created_at`);
}

export async function setAdminRole(opts: { adminId: string; actorId: string; role: AdminRole; status?: string }) {
  const db = await getSql();
  await db.query(`update admins set role=$2, status=coalesce($3,status), updated_at=now() where id=$1`, [
    opts.adminId,
    opts.role,
    opts.status ?? null,
  ]);
  await audit(db, {
    actorId: opts.actorId,
    actorType: "ADMIN",
    action: "roles.write",
    entity: "admin",
    entityId: opts.adminId,
    newValue: { role: opts.role, status: opts.status },
  });
}
