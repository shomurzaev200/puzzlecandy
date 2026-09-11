import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { requireAdmin } from "./admin";
import { many, sql as getSql } from "./db";
import {
  addNote,
  addPayout,
  addTag,
  applyPromoToUser,
  anomalies,
  bulkReviewPayments,
  card360,
  claimEntity,
  createApiKey,
  createHandover,
  createRefund,
  decideApproval,
  decideRefund,
  dueSnoozes,
  ensureOpsSeed,
  entityTimeline,
  importCsv,
  listCanned,
  listClaims,
  listNotes,
  listPayouts,
  listPresence,
  listPromos,
  listRefunds,
  listTags,
  mergeUsers,
  omniSearch,
  reconcile,
  releaseClaim,
  removeTag,
  replayWebhook,
  revokeApiKey,
  saveCanned,
  savePromo,
  saveRule,
  saveWebhook,
  sendBroadcast,
  setRiskFlag,
  snooze,
  touchPresence,
  userSegments,
} from "./ops";

function actor(admin: { id: string; name: string | null; email: string | null }) {
  return { id: admin.id, name: admin.name, email: admin.email };
}

export const opsSearch = createServerFn({ method: "GET" })
  .validator((d: { q: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId, "dashboard");
    if (!data.q.trim()) {
      return { users: [], orders: [], products: [], payments: [], tickets: [], couriers: [], logs: [] };
    }
    return omniSearch(data.q.trim());
  });

export const opsPresence = createServerFn({ method: "POST" })
  .validator((d: { entityType: string; entityId: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId);
    return touchPresence({ admin: actor(admin), entityType: data.entityType, entityId: data.entityId });
  });

export const opsListPresence = createServerFn({ method: "GET" })
  .validator((d: { entityType: string; ids: string[] }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    return listPresence(data.entityType, data.ids);
  });

export const opsClaim = createServerFn({ method: "POST" })
  .validator((d: { entityType: string; entityId: string; release?: boolean }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId);
    if (data.release) return releaseClaim({ admin: actor(admin), entityType: data.entityType, entityId: data.entityId });
    return claimEntity({ admin: actor(admin), entityType: data.entityType, entityId: data.entityId });
  });

export const opsClaims = createServerFn({ method: "GET" })
  .validator((d: { entityType: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    return listClaims(data.entityType);
  });

export const opsTags = createServerFn({ method: "GET" })
  .validator((d: { entityType: string; entityId: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    return listTags(data.entityType, data.entityId);
  });

export const opsTag = createServerFn({ method: "POST" })
  .validator((d: { entityType: string; entityId: string; tag: string; remove?: boolean }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId);
    if (data.remove) return removeTag(data);
    return addTag({ admin: actor(admin), ...data });
  });

export const opsNotes = createServerFn({ method: "GET" })
  .validator((d: { entityType: string; entityId: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    return listNotes(data.entityType, data.entityId);
  });

export const opsNote = createServerFn({ method: "POST" })
  .validator(
    (d: {
      entityType: string;
      entityId: string;
      body: string;
      visibility?: "INTERNAL" | "CUSTOMER" | "SYSTEM";
    }) => d,
  )
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId);
    return addNote({ admin: actor(admin), ...data });
  });

export const opsTimeline = createServerFn({ method: "GET" })
  .validator((d: { entityType: string; entityId: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    return entityTimeline(data.entityType, data.entityId);
  });

export const opsCard = createServerFn({ method: "GET" })
  .validator((d: { kind: "user" | "order" | "courier"; id: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    return card360(data.kind, data.id);
  });

export const opsBulkPayments = createServerFn({ method: "POST" })
  .validator((d: { ids: string[]; decision: "APPROVED" | "REJECTED"; reason?: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "payments.review");
    return bulkReviewPayments({ admin: actor(admin), ...data });
  });

export const opsRefunds = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "payments.read");
    return listRefunds();
  });

export const opsRefundCreate = createServerFn({ method: "POST" })
  .validator((d: { userId: string; orderId?: string; amountCents: number; reason: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "users.balance");
    return createRefund({ admin: actor(admin), ...data });
  });

export const opsRefundDecide = createServerFn({ method: "POST" })
  .validator((d: { id: string; decision: "APPROVED" | "REJECTED"; comment?: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "users.balance");
    return decideRefund({ admin: actor(admin), ...data });
  });

export const opsPromos = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "settings.read");
    return listPromos();
  });

export const opsPromoSave = createServerFn({ method: "POST" })
  .validator(
    (d: {
      id?: string;
      code: string;
      kind: "PERCENT" | "FIXED" | "FREE_DELIVERY";
      valueCents?: number;
      percent?: number;
      maxUses?: number;
      minOrderCents?: number;
      segment?: string;
      endsAt?: string | null;
    }) => d,
  )
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "settings.write");
    return savePromo({ admin: actor(admin), ...data });
  });

export const opsPromoApply = createServerFn({ method: "POST" })
  .validator((d: { code: string; userId: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "users.write");
    return applyPromoToUser({ admin: actor(admin), ...data });
  });

export const opsPayouts = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "couriers.read");
    return listPayouts();
  });

export const opsPayoutAdd = createServerFn({ method: "POST" })
  .validator(
    (d: {
      courierId: string;
      kind: "ACCRUAL" | "BONUS" | "PENALTY" | "PAYOUT";
      amountCents: number;
      reason: string;
    }) => d,
  )
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "couriers.write");
    return addPayout({ admin: actor(admin), ...data });
  });

export const opsSegments = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "users.read");
    return userSegments();
  });

export const opsBroadcast = createServerFn({ method: "POST" })
  .validator((d: { segment: string; body: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "users.message");
    return sendBroadcast({ admin: actor(admin), ...data });
  });

export const opsRisk = createServerFn({ method: "POST" })
  .validator(
    (d: {
      entityType: string;
      entityId: string;
      flag: "blacklist" | "watchlist" | "trusted";
      reason?: string;
    }) => d,
  )
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "users.block");
    return setRiskFlag({ admin: actor(admin), ...data });
  });

export const opsMerge = createServerFn({ method: "POST" })
  .validator((d: { keepId: string; dropId: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "users.write");
    return mergeUsers({ admin: actor(admin), ...data });
  });

export const opsKeys = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "settings.secrets");
    const db = await getSql();
    return many(db, `select id, name, prefix, scopes, ip_allow, last_used_at, revoked_at, created_at from api_keys order by created_at desc`);
  });

export const opsKeyCreate = createServerFn({ method: "POST" })
  .validator((d: { name: string; scopes: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "settings.secrets");
    return createApiKey({ admin: actor(admin), ...data });
  });

export const opsKeyRevoke = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "settings.secrets");
    return revokeApiKey({ admin: actor(admin), id: data.id });
  });

export const opsWebhooks = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "settings.write");
    const db = await getSql();
    const hooks = await many(db, `select * from outbound_webhooks order by created_at desc`);
    const deliveries = await many(db, `select * from webhook_deliveries order by created_at desc limit 40`);
    return { hooks, deliveries };
  });

export const opsWebhookSave = createServerFn({ method: "POST" })
  .validator((d: { url: string; events: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "settings.write");
    return saveWebhook({ admin: actor(admin), ...data });
  });

export const opsWebhookReplay = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "settings.write");
    return replayWebhook({ admin: actor(admin), id: data.id });
  });

export const opsRules = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "settings.read");
    await ensureOpsSeed();
    const db = await getSql();
    return many(db, `select * from automation_rules order by created_at desc`);
  });

export const opsRuleSave = createServerFn({ method: "POST" })
  .validator((d: { name: string; ifJson: unknown; thenJson: unknown }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "settings.write");
    return saveRule({ admin: actor(admin), ...data });
  });

export const opsApprovals = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const db = await getSql();
    return many(db, `select * from approval_items order by created_at desc limit 100`);
  });

export const opsApprovalDecide = createServerFn({ method: "POST" })
  .validator((d: { id: string; decision: "APPROVED" | "REJECTED"; comment?: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId);
    return decideApproval({ admin: actor(admin), ...data });
  });

export const opsHandover = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId);
    return createHandover({ admin: actor(admin) });
  });

export const opsHandovers = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId);
    const db = await getSql();
    return many(db, `select * from shift_handovers order by created_at desc limit 20`);
  });

export const opsAnomalies = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "dashboard");
    return anomalies();
  });

export const opsReconcile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, "transactions.read");
    return reconcile();
  });

export const opsImport = createServerFn({ method: "POST" })
  .validator((d: { kind: "products" | "couriers" | "promo"; csv: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId, "products.write");
    return importCsv({ admin: actor(admin), ...data });
  });

export const opsCanned = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId);
    return listCanned(admin.id);
  });

export const opsCannedSave = createServerFn({ method: "POST" })
  .validator((d: { title: string; body: string; scope?: "TEAM" | "PERSONAL" }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId);
    return saveCanned({ admin: actor(admin), ...data });
  });

export const opsSnooze = createServerFn({ method: "POST" })
  .validator((d: { entityType: string; entityId: string; until: string; note?: string }) => d)
  .middleware([authMiddleware])
  .handler(async ({ context, data }) => {
    const admin = await requireAdmin(context.userId);
    return snooze({ admin: actor(admin), ...data });
  });

export const opsSnoozes = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const admin = await requireAdmin(context.userId);
    return dueSnoozes(admin.id);
  });
