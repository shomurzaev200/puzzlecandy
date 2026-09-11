import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { countAdmins, requireAdmin } from "./admin";
import { many, one, sql as getSql, asInt } from "./db";
import { ensureSeed } from "./seed";

export const adminMe = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    return requireAdmin(context.userId);
  });

export const authHasAdmin = createServerFn({ method: "GET" }).handler(async () => {
  await ensureSeed();
  const n = await countAdmins();
  return { hasAdmin: n > 0 };
});

export const adminNavCounts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const db = await getSql();
    const q = async (text: string) => {
      try {
        return asInt((await one<{ n: number }>(db, text))?.n);
      } catch {
        return 0;
      }
    };
    const [orders, payments, errors, tickets, kyc] = await Promise.all([
      q(`select count(*)::int as n from orders where status in ('NEW','PAID','PROCESSING')`),
      q(`select count(*)::int as n from payments where status in ('PENDING','SUBMITTED','UNDER_REVIEW')`),
      q(`select count(*)::int as n from system_errors where created_at > now() - interval '24 hours'`),
      q(`select count(*)::int as n from support_tickets where status in ('OPEN','WAITING')`),
      q(`select count(*)::int as n from kyc_submissions where status='UNDER_REVIEW'`),
    ]);
    return { orders, payments, errors, tickets, kyc };
  });

export const adminNotifications = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "notifications.read");
    const db = await getSql();
    return many(db, `select * from notifications order by created_at desc limit 80`);
  });

export const adminReadNotifications = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "notifications.read");
    const db = await getSql();
    await db.query(`update notifications set read_at=now() where read_at is null`);
    return { ok: true };
  });
