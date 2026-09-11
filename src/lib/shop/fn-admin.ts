import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { dashboardStats, listAdmins, requireAdmin, setAdminRole } from "./admin";
import { many, one, sql as getSql, asInt } from "./db";
import { searchUsers, setDiscount, setUserStatus } from "./users";
import { listPayments, listPaymentMethods, manualBalance, reviewPayment, savePaymentMethod, setSetting } from "./finance";
import { getProduct, saveProduct, setOrderStatus } from "./commerce";
import { assignTask, mapPoints, reviewDelivery } from "./logistics";
import { adminReply, globalSearch } from "./support";
import { audit } from "./audit";
import { nid } from "./ids";
import { formatMoney } from "./money";
import type { AdminRole, Json } from "./types";
import { ensureSeed } from "./seed";
import { ALL_PERMISSIONS } from "./rbac";
import { createStaff, disableStaff, enableStaff, revokeStaffSessions, STAFF_ROLES } from "./staff";
import { listKyc, reviewKyc } from "./kyc";
import {
  checkAccountNow,
  checkBotNow,
  completeQrSession,
  deleteAccount,
  deleteBot,
  getRouting,
  listBots,
  listTelegramAccounts,
  pollAuthSession,
  reconnectBot,
  revealBotToken,
  saveRouting,
  saveVerifiedBot,
  setAccountPurpose,
  setAccountStatus,
  setBotEnabled,
  startPhoneSession,
  startQrSession,
  tokenMask,
  verifyPhoneCode,
  verifyTelegramToken,
  type AccountPurpose,
  type BotPurpose,
  type TelegramRouting,
} from "./telegram-connect";

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"', '""')}"`;
  return s;
}

export const adminDashboard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "dashboard");
    return dashboardStats();
  });

export const adminUsers = createServerFn({ method: "GET" })
  .validator((d: { q?: string; status?: string; filter?: string; offset?: number }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, "users.read");
    return searchUsers(data);
  });

export const adminUser = createServerFn({ method: "GET" })
  .validator((d: { id: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, "users.read");
    const db = await getSql();
    const user = await one(db, `select * from shop_users where id=$1`, [data.id]);
    if (!user) return null;
    const [orders, txns, pays, revs, tickets] = await Promise.all([
      many(db, `select * from orders where user_id=$1 order by created_at desc limit 30`, [data.id]),
      many(db, `select * from ledger_transactions where user_id=$1 order by created_at desc limit 50`, [data.id]),
      many(db, `select * from payments where user_id=$1 order by created_at desc limit 30`, [data.id]),
      many(db, `select * from reviews where user_id=$1 order by created_at desc`, [data.id]),
      many(db, `select * from support_tickets where user_id=$1 order by created_at desc`, [data.id]),
    ]);
    let kyc = orders.slice(0, 0);
    try {
      kyc = await many(db, `select * from kyc_submissions where user_id=$1 order by created_at desc limit 10`, [data.id]);
    } catch {
      kyc = [];
    }
    return { user, orders, txns, pays, revs, tickets, kyc };
  });

export const adminUserAction = createServerFn({ method: "POST" })
  .validator(
    (d: {
      id: string;
      action: "block" | "unblock" | "vip" | "discount" | "deposit" | "withdraw" | "message";
      amountCents?: number;
      reason?: string;
      comment?: string;
      percent?: number;
      message?: string;
    }) => d,
  )
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId);
    if (data.action === "block") {
      await requireAdmin(context.userId, "users.block");
      await setUserStatus({ userId: data.id, status: "BLOCKED", adminId: admin.id });
      return { ok: true };
    }
    if (data.action === "unblock") {
      await requireAdmin(context.userId, "users.block");
      await setUserStatus({ userId: data.id, status: "ACTIVE", adminId: admin.id });
      return { ok: true };
    }
    if (data.action === "vip") {
      await requireAdmin(context.userId, "users.write");
      await setUserStatus({ userId: data.id, status: "VIP", adminId: admin.id });
      return { ok: true };
    }
    if (data.action === "discount") {
      await requireAdmin(context.userId, "users.write");
      await setDiscount({ userId: data.id, percent: data.percent ?? 0, adminId: admin.id });
      return { ok: true };
    }
    if (data.action === "deposit" || data.action === "withdraw") {
      await requireAdmin(context.userId, "users.balance");
      return manualBalance({
        userId: data.id,
        adminId: admin.id,
        amountCents: data.amountCents ?? 0,
        type: data.action === "deposit" ? "MANUAL_DEPOSIT" : "MANUAL_WITHDRAW",
        reason: data.reason ?? "manual",
        comment: data.comment,
      });
    }
    if (data.action === "message") {
      await requireAdmin(context.userId, "users.message");
      const db = await getSql();
      const user = await one<{ telegram_id: number }>(db, `select telegram_id from shop_users where id=$1`, [data.id]);
      if (user && data.message) {
        await db.query(
          `insert into bot_messages (id, bot, telegram_id, direction, text) values ($1,'main',$2,'OUT',$3)`,
          [nid("bmg"), user.telegram_id, data.message],
        );
      }
      return { ok: true };
    }
    return { ok: false };
  });

export const adminPayments = createServerFn({ method: "GET" })
  .validator((d: { status?: string; q?: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, "payments.read");
    return listPayments(data);
  });

export const adminPayment = createServerFn({ method: "GET" })
  .validator((d: { id: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, "payments.read");
    const db = await getSql();
    const payment = await one(db, `select p.*, u.telegram_id, u.username, u.first_name from payments p join shop_users u on u.id=p.user_id where p.id=$1`, [data.id]);
    const logs = await many(db, `select * from audit_logs where entity='payment' and entity_id=$1 order by created_at`, [data.id]);
    return { payment, logs };
  });

export const adminReviewPayment = createServerFn({ method: "POST" })
  .validator((d: { id: string; decision: "APPROVED" | "REJECTED"; reason?: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "payments.review");
    const res = await reviewPayment({
      paymentId: data.id,
      adminId: admin.id,
      decision: data.decision,
      reason: data.reason,
    });
    if (res.ok && !res.duplicate) {
      const db = await getSql();
      const pay = await one<{ user_id: string; amount_cents: number; public_code: string }>(
        db,
        `select user_id, amount_cents, public_code from payments where id=$1`,
        [data.id],
      );
      const user = pay
        ? await one<{ telegram_id: number; language: string; balance_cents: number }>(
            db,
            `select telegram_id, language, balance_cents from shop_users where id=$1`,
            [pay.user_id],
          )
        : null;
      if (user && pay) {
        const text =
          data.decision === "APPROVED"
            ? `Платёж подтверждён.\nСумма:\n+${formatMoney(asInt(pay.amount_cents))}\nНовый баланс:\n${formatMoney(asInt(user.balance_cents))}`
            : "Платёж отклонён.\nОбратитесь к оператору.";
        await db.query(
          `insert into bot_messages (id, bot, telegram_id, direction, text) values ($1,'main',$2,'OUT',$3)`,
          [nid("bmg"), user.telegram_id, text],
        );
      }
    }
    return res;
  });

export const adminProducts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "products.read");
    const db = await getSql();
    return many(
      db,
      `select p.*, c.slug as category_slug,
              (select url from product_images i where i.product_id=p.id order by is_primary desc limit 1) as image_url
       from products p left join categories c on c.id=p.category_id
       where p.deleted_at is null
       order by p.created_at desc`,
    );
  });

export const adminProduct = createServerFn({ method: "GET" })
  .validator((d: { id: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, "products.read");
    return getProduct(data.id);
  });

export const adminSaveProduct = createServerFn({ method: "POST" })
  .validator((d: { id?: string; payload: Record<string, unknown> }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "products.write");
    return saveProduct({ adminId: admin.id, id: data.id, payload: data.payload });
  });

export const adminDeleteProduct = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "products.delete");
    const db = await getSql();
    await db.query(`update products set deleted_at=now(), published=false, status='ARCHIVED', updated_at=now() where id=$1`, [
      data.id,
    ]);
    await audit(db, { actorId: admin.id, actorType: "ADMIN", action: "product.delete", entity: "product", entityId: data.id });
    return { ok: true };
  });

export const adminCategories = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "products.read");
    const db = await getSql();
    return many(
      db,
      `select c.*, (select count(*)::int from products p where p.category_id=c.id and p.deleted_at is null) as product_count
         from categories c order by sort_order, created_at`,
    );
  });

export const adminSaveCategory = createServerFn({ method: "POST" })
  .validator((d: { id?: string; slug: string; name: string; status?: string; sort?: number }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "categories.write");
    const db = await getSql();
    const id = data.id ?? nid("cat");
    const name = JSON.stringify({ ru: data.name, uz: data.name, en: data.name });
    if (data.id) {
      await db.query(
        `update categories set slug=$2, name_i18n=$3::jsonb, status=coalesce($4,status), sort_order=coalesce($5,sort_order), updated_at=now() where id=$1`,
        [id, data.slug, name, data.status ?? null, data.sort ?? null],
      );
    } else {
      await db.query(
        `insert into categories (id, slug, name_i18n, status, sort_order) values ($1,$2,$3::jsonb,$4,$5)`,
        [id, data.slug, name, data.status ?? "ACTIVE", data.sort ?? 0],
      );
    }
    await audit(db, { actorId: admin.id, actorType: "ADMIN", action: "category.save", entity: "category", entityId: id });
    return { id };
  });

export const adminDeleteCategory = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "categories.write");
    const db = await getSql();
    const used = asInt(
      (await one<{ n: number }>(db, `select count(*)::int as n from products where category_id=$1 and deleted_at is null`, [data.id]))?.n,
    );
    if (used > 0) return { ok: false as const, error: "HAS_PRODUCTS", count: used };
    await db.query(`delete from categories where id=$1`, [data.id]);
    await audit(db, { actorId: admin.id, actorType: "ADMIN", action: "category.delete", entity: "category", entityId: data.id });
    return { ok: true as const };
  });

export const adminOrders = createServerFn({ method: "GET" })
  .validator((d: { status?: string; q?: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, "orders.read");
    const db = await getSql();
    const params: unknown[] = [];
    const where = ["1=1"];
    if (data.status && data.status !== "ALL") {
      params.push(data.status);
      where.push(`o.status=$${params.length}`);
    }
    if (data.q) {
      params.push(`%${data.q.replaceAll("%", "")}%`);
      where.push(`(o.public_code ilike $${params.length} or u.username ilike $${params.length})`);
    }
    return many(
      db,
      `select o.*, u.username, u.telegram_id, u.first_name,
              (select product_name from order_items i where i.order_id=o.id limit 1) as product_name
       from orders o join shop_users u on u.id=o.user_id
       where ${where.join(" and ")}
       order by o.created_at desc limit 100`,
      params,
    );
  });

export const adminOrder = createServerFn({ method: "GET" })
  .validator((d: { id: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, "orders.read");
    const db = await getSql();
    const order = await one(db, `select o.*, u.username, u.telegram_id, u.first_name from orders o join shop_users u on u.id=o.user_id where o.id=$1`, [data.id]);
    const items = await many(db, `select * from order_items where order_id=$1`, [data.id]);
    const events = await many(db, `select * from order_events where order_id=$1 order by created_at`, [data.id]);
    const tasks = await many(db, `select * from courier_tasks where order_id=$1 order by created_at`, [data.id]);
    return { order, items, events, tasks };
  });

export const adminSetOrderStatus = createServerFn({ method: "POST" })
  .validator((d: { id: string; status: string; note?: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "orders.write");
    return setOrderStatus({ orderId: data.id, to: data.status, actorType: "ADMIN", actorId: admin.id, note: data.note });
  });

export const adminTransactions = createServerFn({ method: "GET" })
  .validator((d: { type?: string; q?: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, "transactions.read");
    const db = await getSql();
    const params: unknown[] = [];
    const where = ["1=1"];
    if (data.type && data.type !== "ALL") {
      params.push(data.type);
      where.push(`t.type=$${params.length}`);
    }
    if (data.q) {
      params.push(`%${data.q.replaceAll("%", "")}%`);
      where.push(`(u.username ilike $${params.length} or t.id ilike $${params.length} or t.reason ilike $${params.length})`);
    }
    return many(
      db,
      `select t.*, u.username, u.telegram_id from ledger_transactions t join shop_users u on u.id=t.user_id
       where ${where.join(" and ")} order by t.created_at desc limit 150`,
      params,
    );
  });

export const adminCouriers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "couriers.read");
    const db = await getSql();
    return many(db, `select * from couriers order by created_at desc`);
  });

export const adminCourier = createServerFn({ method: "GET" })
  .validator((d: { id: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, "couriers.read");
    const db = await getSql();
    const courier = await one(db, `select * from couriers where id=$1`, [data.id]);
    const tasks = await many(db, `select * from courier_tasks where courier_id=$1 order by created_at desc`, [data.id]);
    const locs = await many(db, `select * from courier_locations where courier_id=$1 order by created_at desc limit 50`, [data.id]);
    const reports = await many(db, `select * from courier_reports where courier_id=$1 order by created_at desc`, [data.id]);
    return { courier, tasks, locs, reports };
  });

export const adminCourierStatus = createServerFn({ method: "POST" })
  .validator((d: { id: string; status: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "couriers.write");
    const db = await getSql();
    await db.query(`update couriers set status=$2, updated_at=now() where id=$1`, [data.id, data.status]);
    await audit(db, { actorId: admin.id, actorType: "ADMIN", action: "courier.status", entity: "courier", entityId: data.id, newValue: { status: data.status } });
    return { ok: true };
  });

export const adminAssignTask = createServerFn({ method: "POST" })
  .validator((d: { orderId: string; courierId: string; notes?: string; destination?: string; priority?: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "couriers.write");
    const res = await assignTask({ ...data, adminId: admin.id });
    if (res.ok) {
      const db = await getSql();
      const c = await one<{ telegram_id: number }>(db, `select telegram_id from couriers where id=$1`, [data.courierId]);
      if (c) {
        await db.query(
          `insert into bot_messages (id, bot, telegram_id, direction, text, payload)
           values ($1,'courier',$2,'OUT',$3,$4::jsonb)`,
          [
            nid("bmg"),
            c.telegram_id,
            `НОВАЯ ЗАДАЧА\nOrder: ${res.orderCode}\nТовар: ${res.summary}\nКоличество: ${res.qty}`,
            JSON.stringify({ inline: [[{ text: "ПРИНЯТЬ", data: `cacc:${res.id}` }, { text: "ОТКАЗАТЬ", data: `crej:${res.id}` }]] }),
          ],
        );
      }
    }
    return res;
  });

export const adminMap = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "map.read");
    return mapPoints();
  });

export const adminReports = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "couriers.read");
    const db = await getSql();
    return many(
      db,
      `select r.*, c.first_name, c.username, t.public_code, t.order_id
       from courier_reports r
       join couriers c on c.id=r.courier_id
       join courier_tasks t on t.id=r.task_id
       order by r.created_at desc limit 80`,
    );
  });

export const adminReviewDelivery = createServerFn({ method: "POST" })
  .validator((d: { id: string; decision: "APPROVED" | "REJECTED"; reason?: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "couriers.write");
    return reviewDelivery({ adminId: admin.id, reportId: data.id, decision: data.decision, reason: data.reason });
  });

export const adminReviews = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "reviews.moderate");
    const db = await getSql();
    return many(
      db,
      `select r.*, u.username, u.first_name from reviews r join shop_users u on u.id=r.user_id order by r.created_at desc`,
    );
  });

export const adminModerateReview = createServerFn({ method: "POST" })
  .validator((d: { id: string; status: string; reply?: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "reviews.moderate");
    const db = await getSql();
    await db.query(`update reviews set status=$2, admin_reply=coalesce($3, admin_reply), updated_at=now() where id=$1`, [
      data.id,
      data.status,
      data.reply ?? null,
    ]);
    await audit(db, { actorId: admin.id, actorType: "ADMIN", action: "review.moderate", entity: "review", entityId: data.id });
    return { ok: true };
  });

export const adminTickets = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "support.read");
    const db = await getSql();
    return many(
      db,
      `select t.*, u.username, u.first_name, u.telegram_id
       from support_tickets t join shop_users u on u.id=t.user_id
       order by t.updated_at desc`,
    );
  });

export const adminTicket = createServerFn({ method: "GET" })
  .validator((d: { id: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, "support.read");
    const db = await getSql();
    const ticket = await one(
      db,
      `select t.*, u.username, u.first_name, u.telegram_id from support_tickets t join shop_users u on u.id=t.user_id where t.id=$1`,
      [data.id],
    );
    const messages = await many(db, `select * from support_messages where ticket_id=$1 order by created_at`, [data.id]);
    return { ticket, messages };
  });

export const adminTicketReply = createServerFn({ method: "POST" })
  .validator((d: { id: string; body: string; status?: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "support.write");
    const ticket = await adminReply({ ticketId: data.id, adminId: admin.id, body: data.body });
    if (ticket) {
      const db = await getSql();
      const u = await one<{ telegram_id: number }>(db, `select telegram_id from shop_users where id=$1`, [ticket.user_id]);
      if (u) {
        await db.query(
          `insert into bot_messages (id, bot, telegram_id, direction, text) values ($1,'main',$2,'OUT',$3)`,
          [nid("bmg"), u.telegram_id, `Оператор:\n${data.body}`],
        );
      }
      if (data.status) {
        await db.query(`update support_tickets set status=$2, updated_at=now() where id=$1`, [data.id, data.status]);
      }
    }
    return { ok: Boolean(ticket) };
  });

export const adminJobs = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "jobs.write");
    const db = await getSql();
    const jobs = await many(db, `select * from jobs order by created_at desc`);
    const apps = await many(
      db,
      `select a.*, u.username, u.first_name, j.title_i18n from job_applications a
       join shop_users u on u.id=a.user_id join jobs j on j.id=a.job_id
       order by a.created_at desc`,
    );
    return { jobs, apps };
  });

export const adminSaveJob = createServerFn({ method: "POST" })
  .validator((d: { id?: string; title: string; description: string; payment?: string; location?: string; schedule?: string; status?: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, "jobs.write");
    const db = await getSql();
    const id = data.id ?? nid("job");
    const title = JSON.stringify({ ru: data.title, en: data.title, uz: data.title });
    const desc = JSON.stringify({ ru: data.description, en: data.description, uz: data.description });
    if (data.id) {
      await db.query(
        `update jobs set title_i18n=$2::jsonb, description_i18n=$3::jsonb, payment_text=$4, location=$5, schedule=$6, status=coalesce($7,status), updated_at=now() where id=$1`,
        [id, title, desc, data.payment ?? null, data.location ?? null, data.schedule ?? null, data.status ?? null],
      );
    } else {
      await db.query(
        `insert into jobs (id, title_i18n, description_i18n, payment_text, location, schedule, status)
         values ($1,$2::jsonb,$3::jsonb,$4,$5,$6,$7)`,
        [id, title, desc, data.payment ?? null, data.location ?? null, data.schedule ?? null, data.status ?? "ACTIVE"],
      );
    }
    return { id };
  });

export const adminJobApp = createServerFn({ method: "POST" })
  .validator((d: { id: string; status: string; note?: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, "jobs.write");
    const db = await getSql();
    await db.query(`update job_applications set status=$2, admin_note=$3, updated_at=now() where id=$1`, [
      data.id,
      data.status,
      data.note ?? null,
    ]);
    return { ok: true };
  });

export const adminBots = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "bots.manage");
    await ensureSeed();
    const db = await getSql();
    const bots = await listBots();
    const accounts = await listTelegramAccounts();
    const routing = await getRouting();
    const personal = await many(
      db,
      `select p.id, p.username, p.status, p.token_fingerprint, p.created_at, u.telegram_id
       from personal_bots p join shop_users u on u.id=p.user_id order by p.created_at desc`,
    );
    return { bots, accounts, routing, personal };
  });

export const adminVerifyBotToken = createServerFn({ method: "POST" })
  .validator((d: { token: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, "bots.manage");
    return verifyTelegramToken(data.token);
  });

export const adminSaveBot = createServerFn({ method: "POST" })
  .validator((d: { id?: string; title: string; purpose: BotPurpose; token: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "bots.manage");
    const info = await verifyTelegramToken(data.token);
    if (!info.ok) return info;
    const saved = await saveVerifiedBot({
      adminId: admin.id,
      id: data.id,
      title: data.title,
      purpose: data.purpose,
      token: data.token,
      info,
    });
    return { ok: true as const, ...saved, username: info.username, telegramId: info.telegramId, title: info.title };
  });

export const adminCheckBot = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "bots.manage");
    return checkBotNow(data.id, admin.id);
  });

export const adminReconnectBot = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "bots.manage");
    return reconnectBot(data.id, admin.id);
  });

export const adminToggleBot = createServerFn({ method: "POST" })
  .validator((d: { id: string; enabled: boolean }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "bots.manage");
    return setBotEnabled(data.id, data.enabled, admin.id);
  });

export const adminDeleteBot = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "bots.manage");
    return deleteBot(data.id, admin.id);
  });

export const adminRevealBotToken = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "bots.manage");
    if (admin.role !== "SUPER_ADMIN") return { ok: false as const, error: "Только супер-админ может показать токен." };
    const token = await revealBotToken(data.id);
    if (!token) return { ok: false as const, error: "Токен не задан." };
    return { ok: true as const, token, masked: tokenMask(token) };
  });

export const adminStartQr = createServerFn({ method: "POST" })
  .validator((d: { purpose?: AccountPurpose }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, "bots.manage");
    return startQrSession(data.purpose ?? "other");
  });

export const adminPollAuth = createServerFn({ method: "GET" })
  .validator((d: { id: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, "bots.manage");
    return pollAuthSession(data.id);
  });

export const adminConfirmQr = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "bots.manage");
    return completeQrSession(data.id, admin.id);
  });

export const adminStartPhone = createServerFn({ method: "POST" })
  .validator((d: { phone: string; purpose?: AccountPurpose }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, "bots.manage");
    return startPhoneSession(data.phone, data.purpose ?? "other");
  });

export const adminVerifyPhone = createServerFn({ method: "POST" })
  .validator((d: { id: string; code: string; twoFa?: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "bots.manage");
    return verifyPhoneCode(data.id, data.code, admin.id);
  });

export const adminAccountPurpose = createServerFn({ method: "POST" })
  .validator((d: { id: string; purpose: AccountPurpose }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "bots.manage");
    return setAccountPurpose(data.id, data.purpose, admin.id);
  });

export const adminAccountStatus = createServerFn({ method: "POST" })
  .validator((d: { id: string; status: "CONNECTED" | "DISABLED" | "NEED_AUTH" }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "bots.manage");
    return setAccountStatus(data.id, data.status, admin.id);
  });

export const adminDeleteAccount = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "bots.manage");
    return deleteAccount(data.id, admin.id);
  });

export const adminCheckAccount = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "bots.manage");
    return checkAccountNow(data.id, admin.id);
  });

export const adminSaveRouting = createServerFn({ method: "POST" })
  .validator((d: Partial<TelegramRouting>) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "bots.manage");
    const routing = await saveRouting(data, admin.id);
    return { ok: true, routing };
  });

export const adminBulkProducts = createServerFn({ method: "POST" })
  .validator((d: { ids: string[]; action: "hide" | "activate" | "delete" }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const perm = data.action === "delete" ? "products.delete" : "products.write";
    const admin = await requireAdmin(context.userId, perm);
    const db = await getSql();
    if (!data.ids.length) return { ok: true, n: 0 };
    for (const id of data.ids) {
      if (data.action === "hide") {
        await db.query(`update products set published=false, status='HIDDEN', updated_at=now() where id=$1`, [id]);
      } else if (data.action === "activate") {
        await db.query(`update products set published=true, status='ACTIVE', updated_at=now() where id=$1 and deleted_at is null`, [id]);
      } else {
        await db.query(`update products set deleted_at=now(), published=false, status='ARCHIVED', updated_at=now() where id=$1`, [id]);
      }
    }
    await audit(db, { actorId: admin.id, actorType: "ADMIN", action: `product.bulk.${data.action}`, entity: "product", newValue: { ids: data.ids } });
    return { ok: true, n: data.ids.length };
  });


export const adminSettings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId, "settings.read");
    const db = await getSql();
    const rows = await many<{ key: string; value_json: Json }>(db, `select key, value_json from shop_settings`);
    const map: Record<string, Json> = {};
    for (const r of rows) {
      if (r.key === "secrets" && !admin.permissions.includes("settings.secrets") && admin.role !== "SUPER_ADMIN") {
        map[r.key] = { redacted: true };
      } else map[r.key] = r.value_json;
    }
    const pages = await many(db, `select slug, title_i18n, body_i18n from pages`);
    const rates = await many(db, `select * from exchange_rates`);
    return { settings: map, pages, rates, canSecrets: admin.role === "SUPER_ADMIN" || admin.permissions.includes("settings.secrets") };
  });

export const adminSaveSettings = createServerFn({ method: "POST" })
  .validator((d: { settings?: Record<string, unknown>; pages?: Array<{ slug: string; title: string; body: string }>; rates?: Array<{ code: string; rate: number }> }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "settings.write");
    if (data.settings) {
      for (const [k, v] of Object.entries(data.settings)) {
        if (k === "secrets" && admin.role !== "SUPER_ADMIN") continue;
        await setSetting(k, v, admin.id);
      }
    }
    const db = await getSql();
    if (data.pages) {
      for (const p of data.pages) {
        await db.query(
          `update pages set title_i18n=$2::jsonb, body_i18n=$3::jsonb, updated_at=now(), updated_by=$4 where slug=$1`,
          [p.slug, JSON.stringify({ ru: p.title, en: p.title, uz: p.title }), JSON.stringify({ ru: p.body, en: p.body, uz: p.body }), admin.id],
        );
      }
    }
    if (data.rates) {
      for (const r of data.rates) {
        await db.query(
          `insert into exchange_rates (code, rate_to_usd, updated_at) values ($1,$2,now())
           on conflict (code) do update set rate_to_usd=excluded.rate_to_usd, updated_at=now()`,
          [r.code, r.rate],
        );
      }
    }
    await audit(db, { actorId: admin.id, actorType: "ADMIN", action: "settings.edit", entity: "settings" });
    return { ok: true };
  });

export const adminAudit = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "audit.read");
    const db = await getSql();
    return many(db, `select * from audit_logs order by created_at desc limit 200`);
  });

export const adminErrors = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "errors.read");
    const db = await getSql();
    return many(db, `select * from system_errors order by created_at desc limit 200`);
  });

export const adminRoles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "roles.write");
    const admins = await listAdmins();
    return { admins, permissions: ALL_PERMISSIONS, roles: STAFF_ROLES };
  });

export const adminSetRole = createServerFn({ method: "POST" })
  .validator((d: { id: string; role: AdminRole; status?: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "roles.write");
    await setAdminRole({ adminId: data.id, actorId: admin.id, role: data.role, status: data.status });
    return { ok: true };
  });

export const adminCreateStaff = createServerFn({ method: "POST" })
  .validator((d: { email: string; name: string; role: AdminRole; generatePassword?: boolean }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "roles.write");
    if (admin.role !== "SUPER_ADMIN") return { ok: false as const, error: "Только супер-админ может добавлять сотрудников." };
    const result = await createStaff({
      actorId: admin.id,
      email: data.email,
      name: data.name,
      role: data.role,
      mustChangePassword: true,
    });
    return { ok: true as const, email: result.email, password: result.password };
  });

export const adminDisableStaff = createServerFn({ method: "POST" })
  .validator((d: { id: string; enable?: boolean }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "roles.write");
    if (admin.role !== "SUPER_ADMIN") return { ok: false as const, error: "Только супер-админ." };
    if (data.enable) await enableStaff({ adminId: data.id, actorId: admin.id });
    else await disableStaff({ adminId: data.id, actorId: admin.id });
    return { ok: true as const };
  });

export const adminRevokeStaffSessions = createServerFn({ method: "POST" })
  .validator((d: { userId: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "roles.write");
    if (admin.role !== "SUPER_ADMIN") return { ok: false as const, error: "Только супер-админ." };
    const n = await revokeStaffSessions(data.userId);
    return { ok: true as const, n };
  });

export const adminSearch = createServerFn({ method: "GET" })
  .validator((d: { q: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, "dashboard");
    if (!data.q.trim()) return { users: [], orders: [], products: [], payments: [], tickets: [], couriers: [], kyc: [] };
    return globalSearch(data.q.trim());
  });

export const adminExport = createServerFn({ method: "GET" })
  .validator((d: { kind: string; format: "csv" | "json" }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, "export");
    const db = await getSql();
    const table: Record<string, string> = {
      users: "select * from shop_users order by created_at desc",
      orders: "select * from orders order by created_at desc",
      payments: "select * from payments order by created_at desc",
      transactions: "select * from ledger_transactions order by created_at desc",
      products: "select * from products where deleted_at is null",
      courier_reports: "select * from courier_reports order by created_at desc",
    };
    const q = table[data.kind];
    if (!q) return { filename: "empty.json", body: "[]", mime: "application/json" };
    const rows = await many(db, q);
    if (data.format === "json") {
      return { filename: `${data.kind}.json`, body: JSON.stringify(rows, null, 2), mime: "application/json" };
    }
    if (!rows.length) return { filename: `${data.kind}.csv`, body: "", mime: "text/csv" };
    const keys = Object.keys(rows[0]);
    const lines = [keys.join(","), ...rows.map((r) => keys.map((k) => csvEscape(r[k])).join(","))];
    return { filename: `${data.kind}.csv`, body: lines.join("\n"), mime: "text/csv" };
  });

export const adminSubmissions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "products.write");
    const db = await getSql();
    return many(db, `select * from product_submissions order by created_at desc`);
  });

export const adminReviewSubmission = createServerFn({ method: "POST" })
  .validator((d: { id: string; decision: "APPROVED" | "REJECTED"; reason?: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "products.write");
    if (data.decision === "REJECTED" && !data.reason?.trim()) return { ok: false, error: "REASON_REQUIRED" };
    const db = await getSql();
    await db.query(
      `update product_submissions set status=$2, reason=$3, reviewed_by=$4, reviewed_at=now() where id=$1`,
      [data.id, data.decision, data.reason ?? null, admin.id],
    );
    return { ok: true };
  });

export const publicStats = createServerFn({ method: "GET" }).handler(async () => {
  await ensureSeed();
  const db = await getSql();
  const deals = asInt((await one<{ n: number }>(db, `select count(*)::int as n from orders`))?.n);
  const products = asInt((await one<{ n: number }>(db, `select count(*)::int as n from products where published=true and deleted_at is null`))?.n);
  return { deals, products };
});

export const adminPaymentMethods = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "payments.read");
    return listPaymentMethods();
  });

export const adminSavePaymentMethod = createServerFn({ method: "POST" })
  .validator((d: { id?: string; title: string; kind: string; details: string; comment?: string; status?: string; sort?: number }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "payments.review");
    return savePaymentMethod({ ...data, adminId: admin.id });
  });

export const adminKyc = createServerFn({ method: "GET" })
  .validator((d: { status?: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, "kyc.read");
    return listKyc(data.status);
  });

export const adminReviewKyc = createServerFn({ method: "POST" })
  .validator((d: { id: string; decision: "APPROVED" | "REJECTED"; reason?: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "kyc.write");
    return reviewKyc({ id: data.id, adminId: admin.id, decision: data.decision, reason: data.reason });
  });

