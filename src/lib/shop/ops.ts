import { createHash, randomBytes } from "node:crypto";
import { asInt, many, one, sql as getSql } from "./db";
import { nid, nextPublicCode, padSeq, ymd } from "./ids";
import { audit } from "./audit";
import { reviewPayment } from "./finance";
import { formatMoney } from "./money";
import { fraudScore } from "./ops-client";

type AdminRef = { id: string; name: string | null; email: string | null };

async function nextOpsCode(kind: "REF" | "PMO" | "APV" | "BRC"): Promise<string> {
  const db = await getSql();
  const rows = await db.query<{ value: number }>(
    `insert into id_sequences (name, value) values ($1, 1)
     on conflict (name) do update set value = id_sequences.value + 1
     returning value`,
    [kind],
  );
  return `${kind}-${ymd()}-${padSeq(rows[0]?.value ?? 1)}`;
}

export async function ensureOpsSeed() {
  const db = await getSql();
  const n = asInt((await one<{ n: number }>(db, `select count(*)::int as n from canned_responses`))?.n);
  if (n === 0) {
    const rows = [
      ["Принят в работу", "Здравствуйте, {name}! Ваш заказ #{order_id} принят в работу. Курьер свяжется с вами в течение 15 минут."],
      ["Платёж подтверждён", "Платёж {pay_id} подтверждён. Сумма {amount} зачислена на баланс."],
      ["Нужен скриншот", "Пожалуйста, отправьте скриншот перевода в бот кассы. После проверки баланс обновится."],
      ["Доставка", "Курьер @{courier} уже в пути. Если что-то изменится — напишите сюда."],
    ];
    for (const [title, body] of rows) {
      await db.query(
        `insert into canned_responses (id, title, body, scope) values ($1,$2,$3,'TEAM')`,
        [nid("cnd"), title, body],
      );
    }
  }
}

export async function touchPresence(opts: {
  admin: AdminRef;
  entityType: string;
  entityId: string;
}) {
  const db = await getSql();
  await db.query(
    `insert into ops_presence (entity_type, entity_id, admin_id, admin_name, last_seen)
     values ($1,$2,$3,$4,now())
     on conflict (entity_type, entity_id, admin_id)
     do update set last_seen=now(), admin_name=excluded.admin_name`,
    [opts.entityType, opts.entityId, opts.admin.id, opts.admin.name ?? opts.admin.email],
  );
  return many(
    db,
    `select admin_id, admin_name, last_seen from ops_presence
      where entity_type=$1 and entity_id=$2 and last_seen > now() - interval '2 minutes'
        and admin_id <> $3`,
    [opts.entityType, opts.entityId, opts.admin.id],
  );
}

export async function listPresence(entityType: string, ids: string[]) {
  if (!ids.length) return [];
  const db = await getSql();
  return many(
    db,
    `select entity_id, admin_id, admin_name, last_seen from ops_presence
      where entity_type=$1 and last_seen > now() - interval '2 minutes'`,
    [entityType],
  );
}

export async function claimEntity(opts: {
  admin: AdminRef;
  entityType: string;
  entityId: string;
  minutes?: number;
}) {
  const db = await getSql();
  const minutes = opts.minutes ?? 15;
  const existing = await one<{ admin_id: string; admin_name: string; expires_at: string }>(
    db,
    `select admin_id, admin_name, expires_at from ops_claims
      where entity_type=$1 and entity_id=$2 and expires_at > now()`,
    [opts.entityType, opts.entityId],
  );
  if (existing && existing.admin_id !== opts.admin.id) {
    return { ok: false as const, error: "CLAIMED", holder: existing };
  }
  const expires = new Date(Date.now() + minutes * 60_000).toISOString();
  await db.query(
    `insert into ops_claims (entity_type, entity_id, admin_id, admin_name, claimed_at, expires_at)
     values ($1,$2,$3,$4,now(),$5)
     on conflict (entity_type, entity_id)
     do update set admin_id=$3, admin_name=$4, claimed_at=now(), expires_at=$5`,
    [opts.entityType, opts.entityId, opts.admin.id, opts.admin.name ?? opts.admin.email, expires],
  );
  await audit(null, {
    actorId: opts.admin.id,
    actorType: "ADMIN",
    action: "ops.claim",
    entity: opts.entityType,
    entityId: opts.entityId,
  });
  return { ok: true as const };
}

export async function releaseClaim(opts: { admin: AdminRef; entityType: string; entityId: string }) {
  const db = await getSql();
  await db.query(
    `delete from ops_claims where entity_type=$1 and entity_id=$2 and admin_id=$3`,
    [opts.entityType, opts.entityId, opts.admin.id],
  );
  return { ok: true };
}

export async function listClaims(entityType: string) {
  const db = await getSql();
  return many(
    db,
    `select entity_id, admin_id, admin_name, claimed_at, expires_at
       from ops_claims where entity_type=$1 and expires_at > now()`,
    [entityType],
  );
}

export async function addTag(opts: { admin: AdminRef; entityType: string; entityId: string; tag: string }) {
  const tag = opts.tag.trim().toLowerCase().slice(0, 32);
  if (!tag) return { ok: false as const, error: "EMPTY" };
  const db = await getSql();
  await db.query(
    `insert into entity_tags (id, entity_type, entity_id, tag, created_by)
     values ($1,$2,$3,$4,$5) on conflict do nothing`,
    [nid("tag"), opts.entityType, opts.entityId, tag, opts.admin.id],
  );
  return { ok: true as const };
}

export async function removeTag(opts: { entityType: string; entityId: string; tag: string }) {
  const db = await getSql();
  await db.query(
    `delete from entity_tags where entity_type=$1 and entity_id=$2 and tag=$3`,
    [opts.entityType, opts.entityId, opts.tag],
  );
  return { ok: true };
}

export async function listTags(entityType: string, entityId: string) {
  const db = await getSql();
  return many(db, `select * from entity_tags where entity_type=$1 and entity_id=$2 order by created_at`, [
    entityType,
    entityId,
  ]);
}

export async function addNote(opts: {
  admin: AdminRef;
  entityType: string;
  entityId: string;
  body: string;
  visibility?: "INTERNAL" | "CUSTOMER" | "SYSTEM";
}) {
  if (!opts.body.trim()) return { ok: false as const, error: "EMPTY" };
  const db = await getSql();
  const id = nid("nte");
  await db.query(
    `insert into entity_notes (id, entity_type, entity_id, body, visibility, author_id, author_name)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [
      id,
      opts.entityType,
      opts.entityId,
      opts.body.trim(),
      opts.visibility ?? "INTERNAL",
      opts.admin.id,
      opts.admin.name ?? opts.admin.email,
    ],
  );
  return { ok: true as const, id };
}

export async function listNotes(entityType: string, entityId: string) {
  const db = await getSql();
  return many(
    db,
    `select * from entity_notes where entity_type=$1 and entity_id=$2 order by created_at desc`,
    [entityType, entityId],
  );
}

export async function entityTimeline(entityType: string, entityId: string) {
  const db = await getSql();
  const logs = await many(
    db,
    `select created_at, actor_type, actor_id, action, entity, new_value
       from audit_logs where entity=$1 and entity_id=$2 order by created_at`,
    [entityType, entityId],
  );
  const notes = await many(
    db,
    `select created_at, author_name, body, visibility from entity_notes
      where entity_type=$1 and entity_id=$2 order by created_at`,
    [entityType, entityId],
  );
  const events = [
    ...logs.map((l) => ({
      at: String(l.created_at),
      kind: "audit" as const,
      title: String(l.action),
      detail: `${l.actor_type}`,
    })),
    ...notes.map((n) => ({
      at: String(n.created_at),
      kind: n.visibility === "INTERNAL" ? ("note" as const) : ("msg" as const),
      title: String(n.visibility),
      detail: String(n.body),
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  return events;
}

export async function bulkReviewPayments(opts: {
  admin: AdminRef;
  ids: string[];
  decision: "APPROVED" | "REJECTED";
  reason?: string;
}) {
  const results: Array<{ id: string; ok: boolean; duplicate?: boolean; error?: string }> = [];
  for (const id of opts.ids) {
    const res = await reviewPayment({
      paymentId: id,
      adminId: opts.admin.id,
      decision: opts.decision,
      reason: opts.reason,
    });
    results.push({
      id,
      ok: res.ok,
      duplicate: res.ok ? res.duplicate : undefined,
      error: res.ok ? undefined : res.error,
    });
  }
  return results;
}

export async function createRefund(opts: {
  admin: AdminRef;
  userId: string;
  orderId?: string;
  amountCents: number;
  reason: string;
}) {
  if (opts.amountCents <= 0 || !opts.reason.trim()) return { ok: false as const, error: "BAD_INPUT" };
  const db = await getSql();
  const id = nid("rfd");
  const code = await nextOpsCode("REF");
  const needsSecond = opts.amountCents > 10000;
  await db.query(
    `insert into refunds (id, public_code, order_id, user_id, amount_cents, status, reason, requested_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      id,
      code,
      opts.orderId ?? null,
      opts.userId,
      opts.amountCents,
      needsSecond ? "REQUESTED" : "APPROVED",
      opts.reason.trim(),
      opts.admin.id,
    ],
  );
  if (needsSecond) {
    await db.query(
      `insert into approval_items (id, kind, title, amount_cents, payload_json, requested_by, status)
       values ($1,'REFUND',$2,$3,$4::jsonb,$5,'PENDING')`,
      [
        nid("apv"),
        `Возврат ${code} ${formatMoney(opts.amountCents)}`,
        opts.amountCents,
        JSON.stringify({ refundId: id }),
        opts.admin.id,
      ],
    );
  }
  await audit(db, {
    actorId: opts.admin.id,
    actorType: "ADMIN",
    action: "refund.create",
    entity: "refund",
    entityId: id,
    newValue: { amount: opts.amountCents, needsSecond },
  });
  return { ok: true as const, id, code, needsSecond };
}

export async function decideRefund(opts: {
  admin: AdminRef;
  id: string;
  decision: "APPROVED" | "REJECTED";
  comment?: string;
}) {
  const db = await getSql();
  const row = await one<{
    id: string;
    user_id: string;
    order_id: string | null;
    amount_cents: number;
    status: string;
    requested_by: string | null;
    public_code: string;
  }>(db, `select * from refunds where id=$1`, [opts.id]);
  if (!row) return { ok: false as const, error: "NOT_FOUND" };
  if (row.status === "DONE" || row.status === "REJECTED") return { ok: true as const, duplicate: true };
  if (opts.decision === "REJECTED") {
    await db.query(
      `update refunds set status='REJECTED', approved_by=$2, updated_at=now() where id=$1 and status in ('REQUESTED','APPROVED')`,
      [opts.id, opts.admin.id],
    );
    return { ok: true as const };
  }
  if (row.requested_by === opts.admin.id && asInt(row.amount_cents) > 10000) {
    return { ok: false as const, error: "SECOND_ADMIN_REQUIRED" };
  }
  const moved = await one<{ balance_cents: number }>(
    db,
    `update shop_users set balance_cents = balance_cents + $2, updated_at=now()
      where id=$1 returning balance_cents`,
    [row.user_id, row.amount_cents],
  );
  if (!moved) return { ok: false as const, error: "USER" };
  const after = asInt(moved.balance_cents);
  await db.query(
    `insert into ledger_transactions
      (id, user_id, amount_cents, type, balance_before, balance_after, reference_id, reason, admin_id)
     values ($1,$2,$3,'REFUND',$4,$5,$6,$7,$8)`,
    [
      nid("txn"),
      row.user_id,
      row.amount_cents,
      after - asInt(row.amount_cents),
      after,
      row.id,
      `Refund ${row.public_code}`,
      opts.admin.id,
    ],
  );
  await db.query(
    `update refunds set status='DONE', approved_by=$2, processed_at=now(), updated_at=now() where id=$1`,
    [opts.id, opts.admin.id],
  );
  if (row.order_id) {
    await db.query(`update orders set status='REFUNDED', updated_at=now() where id=$1`, [row.order_id]);
  }
  await audit(db, {
    actorId: opts.admin.id,
    actorType: "ADMIN",
    action: "refund.done",
    entity: "refund",
    entityId: opts.id,
    newValue: { amount: row.amount_cents, balance: after },
  });
  return { ok: true as const, balance: after };
}

export async function listRefunds() {
  const db = await getSql();
  return many(
    db,
    `select r.*, u.username, u.first_name, u.telegram_id
       from refunds r join shop_users u on u.id=r.user_id
      order by r.created_at desc limit 200`,
  );
}

export async function savePromo(opts: {
  admin: AdminRef;
  id?: string;
  code: string;
  kind: "PERCENT" | "FIXED" | "FREE_DELIVERY";
  valueCents?: number;
  percent?: number;
  maxUses?: number;
  minOrderCents?: number;
  segment?: string;
  endsAt?: string | null;
}) {
  const db = await getSql();
  const code = opts.code.trim().toUpperCase();
  if (!code) return { ok: false as const, error: "CODE" };
  const id = opts.id ?? nid("pmo");
  if (opts.id) {
    await db.query(
      `update promo_codes set code=$2, kind=$3, value_cents=$4, percent=$5, max_uses=$6,
              min_order_cents=$7, segment=$8, ends_at=$9 where id=$1`,
      [
        id,
        code,
        opts.kind,
        opts.valueCents ?? 0,
        opts.percent ?? 0,
        opts.maxUses ?? null,
        opts.minOrderCents ?? 0,
        opts.segment ?? null,
        opts.endsAt ?? null,
      ],
    );
  } else {
    await db.query(
      `insert into promo_codes (id, code, kind, value_cents, percent, max_uses, min_order_cents, segment, ends_at, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        id,
        code,
        opts.kind,
        opts.valueCents ?? 0,
        opts.percent ?? 0,
        opts.maxUses ?? null,
        opts.minOrderCents ?? 0,
        opts.segment ?? null,
        opts.endsAt ?? null,
        opts.admin.id,
      ],
    );
  }
  return { ok: true as const, id };
}

export async function applyPromoToUser(opts: { admin: AdminRef; code: string; userId: string }) {
  const db = await getSql();
  const promo = await one<{
    id: string;
    kind: string;
    percent: number;
    value_cents: number;
    max_uses: number | null;
    used_count: number;
    status: string;
    min_order_cents: number;
  }>(db, `select * from promo_codes where code=$1`, [opts.code.trim().toUpperCase()]);
  if (!promo || promo.status !== "ACTIVE") return { ok: false as const, error: "INVALID" };
  if (promo.max_uses != null && asInt(promo.used_count) >= asInt(promo.max_uses)) {
    return { ok: false as const, error: "LIMIT" };
  }
  if (promo.kind === "PERCENT") {
    await db.query(`update shop_users set discount_percent=$2, updated_at=now() where id=$1`, [
      opts.userId,
      Math.min(90, asInt(promo.percent)),
    ]);
  }
  await db.query(
    `insert into promo_redemptions (id, promo_id, user_id, saved_cents) values ($1,$2,$3,$4)`,
    [nid("prm"), promo.id, opts.userId, promo.value_cents],
  );
  await db.query(`update promo_codes set used_count = used_count + 1 where id=$1`, [promo.id]);
  await audit(null, {
    actorId: opts.admin.id,
    actorType: "ADMIN",
    action: "promo.apply",
    entity: "user",
    entityId: opts.userId,
    newValue: { code: opts.code, kind: promo.kind },
  });
  return { ok: true as const };
}

export async function listPromos() {
  const db = await getSql();
  return many(
    db,
    `select p.*,
            (select count(*)::int from promo_redemptions r where r.promo_id=p.id) as redemptions,
            (select coalesce(sum(saved_cents),0)::int from promo_redemptions r where r.promo_id=p.id) as saved_cents
       from promo_codes p order by created_at desc`,
  );
}

export async function addPayout(opts: {
  admin: AdminRef;
  courierId: string;
  kind: "ACCRUAL" | "BONUS" | "PENALTY" | "PAYOUT";
  amountCents: number;
  reason: string;
}) {
  const db = await getSql();
  const signed =
    opts.kind === "PENALTY" || opts.kind === "PAYOUT" ? -Math.abs(opts.amountCents) : Math.abs(opts.amountCents);
  await db.query(
    `insert into courier_payouts (id, courier_id, kind, amount_cents, reason, admin_id)
     values ($1,$2,$3,$4,$5,$6)`,
    [nid("pyt"), opts.courierId, opts.kind, signed, opts.reason, opts.admin.id],
  );
  return { ok: true };
}

export async function listPayouts() {
  const db = await getSql();
  return many(
    db,
    `select p.*, c.username, c.first_name,
            (select coalesce(sum(amount_cents),0)::int from courier_payouts x where x.courier_id=p.courier_id) as balance_cents
       from courier_payouts p
       join couriers c on c.id=p.courier_id
      order by p.created_at desc limit 300`,
  );
}

export async function setRiskFlag(opts: {
  admin: AdminRef;
  entityType: string;
  entityId: string;
  flag: "blacklist" | "watchlist" | "trusted";
  reason?: string;
}) {
  const db = await getSql();
  await db.query(`delete from risk_flags where entity_type=$1 and entity_id=$2`, [opts.entityType, opts.entityId]);
  await db.query(
    `insert into risk_flags (id, entity_type, entity_id, flag, reason, created_by) values ($1,$2,$3,$4,$5,$6)`,
    [nid("rsk"), opts.entityType, opts.entityId, opts.flag, opts.reason ?? null, opts.admin.id],
  );
  if (opts.entityType === "user" && opts.flag === "blacklist") {
    await db.query(`update shop_users set status='BLOCKED', updated_at=now() where id=$1`, [opts.entityId]);
  }
  await audit(null, {
    actorId: opts.admin.id,
    actorType: "ADMIN",
    action: "risk.flag",
    entity: opts.entityType,
    entityId: opts.entityId,
    newValue: { flag: opts.flag },
  });
  return { ok: true };
}

export async function userSegments() {
  const db = await getSql();
  const now = await many(
    db,
    `select id, telegram_id, username, first_name, status, balance_cents, purchases_count, registered_at, last_activity_at
       from shop_users order by last_activity_at desc`,
  );
  const groups: Record<string, typeof now> = {
    new: [],
    vip: [],
    sleeping: [],
    churn: [],
    active: [],
  };
  const day = 86400000;
  for (const u of now) {
    const age = Date.now() - new Date(String(u.registered_at)).getTime();
    const idle = Date.now() - new Date(String(u.last_activity_at)).getTime();
    if (u.status === "VIP") groups.vip.push(u);
    else if (age < 7 * day) groups.new.push(u);
    else if (idle > 30 * day) groups.churn.push(u);
    else if (idle > 7 * day) groups.sleeping.push(u);
    else groups.active.push(u);
  }
  return groups;
}

export async function sendBroadcast(opts: { admin: AdminRef; segment: string; body: string }) {
  if (!opts.body.trim()) return { ok: false as const, error: "EMPTY" };
  const groups = await userSegments();
  const users = groups[opts.segment] ?? [];
  const db = await getSql();
  const id = nid("brc");
  await db.query(
    `insert into broadcasts (id, segment, body, status, sent_at, sent_count, created_by)
     values ($1,$2,$3,'SENT',now(),$4,$5)`,
    [id, opts.segment, opts.body.trim(), users.length, opts.admin.id],
  );
  for (const u of users) {
    const tg = asInt(u.telegram_id);
    if (!tg) continue;
    await db.query(
      `insert into bot_messages (id, bot, telegram_id, direction, text) values ($1,'main',$2,'OUT',$3)`,
      [nid("bmg"), tg, opts.body.trim()],
    );
  }
  await audit(null, {
    actorId: opts.admin.id,
    actorType: "ADMIN",
    action: "broadcast.send",
    entity: "broadcast",
    entityId: id,
    newValue: { segment: opts.segment, count: users.length },
  });
  return { ok: true as const, sent: users.length };
}

export async function createApiKey(opts: { admin: AdminRef; name: string; scopes: string }) {
  const raw = `pk_live_${randomBytes(18).toString("hex")}`;
  const hash = createHash("sha256").update(raw).digest("hex");
  const prefix = raw.slice(0, 12);
  const db = await getSql();
  const id = nid("key");
  await db.query(
    `insert into api_keys (id, name, prefix, hash, scopes, created_by) values ($1,$2,$3,$4,$5,$6)`,
    [id, opts.name.trim() || "key", prefix, hash, opts.scopes || "read:orders", opts.admin.id],
  );
  await audit(null, {
    actorId: opts.admin.id,
    actorType: "ADMIN",
    action: "apikey.create",
    entity: "api_key",
    entityId: id,
  });
  return { ok: true as const, id, key: raw, prefix };
}

export async function revokeApiKey(opts: { admin: AdminRef; id: string }) {
  const db = await getSql();
  await db.query(`update api_keys set revoked_at=now() where id=$1`, [opts.id]);
  await audit(null, {
    actorId: opts.admin.id,
    actorType: "ADMIN",
    action: "apikey.revoke",
    entity: "api_key",
    entityId: opts.id,
  });
  return { ok: true };
}

export async function saveWebhook(opts: { admin: AdminRef; url: string; events: string }) {
  const db = await getSql();
  const id = nid("whk");
  await db.query(
    `insert into outbound_webhooks (id, url, events, created_by) values ($1,$2,$3,$4)`,
    [id, opts.url.trim(), opts.events.trim() || "payment.approved,order.created", opts.admin.id],
  );
  return { ok: true as const, id };
}

export async function replayWebhook(opts: { admin: AdminRef; id: string }) {
  const db = await getSql();
  const hook = await one<{ id: string; url: string; events: string }>(
    db,
    `select * from outbound_webhooks where id=$1`,
    [opts.id],
  );
  if (!hook) return { ok: false as const, error: "NOT_FOUND" };
  const payload = { event: "replay", at: new Date().toISOString(), by: opts.admin.id };
  let status = "SENT";
  let code = 0;
  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    code = res.status;
    if (!res.ok) status = "FAILED";
  } catch {
    status = "FAILED";
  }
  await db.query(
    `insert into webhook_deliveries (id, webhook_id, event_type, payload_json, status, response_code)
     values ($1,$2,'replay',$3::jsonb,$4,$5)`,
    [nid("whd"), hook.id, JSON.stringify(payload), status, code],
  );
  return { ok: true as const, status, code };
}

export async function saveRule(opts: {
  admin: AdminRef;
  name: string;
  ifJson: unknown;
  thenJson: unknown;
}) {
  const db = await getSql();
  const id = nid("rul");
  await db.query(
    `insert into automation_rules (id, name, if_json, then_json, created_by)
     values ($1,$2,$3::jsonb,$4::jsonb,$5)`,
    [id, opts.name.trim(), JSON.stringify(opts.ifJson), JSON.stringify(opts.thenJson), opts.admin.id],
  );
  return { ok: true as const, id };
}

export async function evaluatePaymentRules(payment: {
  amount_cents: number;
  user_id: string;
  registered_at?: unknown;
}) {
  const db = await getSql();
  const rules = await many<{
    id: string;
    name: string;
    if_json: { field?: string; op?: string; value?: number | string };
    then_json: { flag?: string; notify?: string };
  }>(db, `select * from automation_rules where enabled=true`);
  const fired: string[] = [];
  for (const r of rules) {
    const iff = r.if_json ?? {};
    let hit = false;
    if (iff.field === "payment.amount" && iff.op === ">" && asInt(payment.amount_cents) > Number(iff.value)) hit = true;
    if (hit) {
      fired.push(r.name);
      await db.query(
        `update automation_rules set fire_count=fire_count+1, last_fired_at=now() where id=$1`,
        [r.id],
      );
      if (r.then_json?.flag) {
        await db.query(
          `insert into entity_tags (id, entity_type, entity_id, tag) values ($1,'payment',$2,$3) on conflict do nothing`,
          [nid("tag"), payment.user_id, r.then_json.flag],
        );
      }
    }
  }
  return fired;
}

export async function decideApproval(opts: {
  admin: AdminRef;
  id: string;
  decision: "APPROVED" | "REJECTED";
  comment?: string;
}) {
  const db = await getSql();
  const item = await one<{ id: string; kind: string; payload_json: { refundId?: string }; status: string }>(
    db,
    `select * from approval_items where id=$1`,
    [opts.id],
  );
  if (!item || item.status !== "PENDING") return { ok: false as const, error: "NOT_PENDING" };
  await db.query(
    `update approval_items set status=$2, decided_by=$3, comment=$4 where id=$1`,
    [opts.id, opts.decision, opts.admin.id, opts.comment ?? null],
  );
  if (item.kind === "REFUND" && item.payload_json?.refundId && opts.decision === "APPROVED") {
    return decideRefund({ admin: opts.admin, id: item.payload_json.refundId, decision: "APPROVED" });
  }
  return { ok: true as const };
}

export async function createHandover(opts: { admin: AdminRef }) {
  const db = await getSql();
  const pendingPay = asInt((await one<{ n: number }>(db, `select count(*)::int as n from payments where status='PENDING'`))?.n);
  const pendingDel = asInt(
    (await one<{ n: number }>(db, `select count(*)::int as n from courier_reports where status='PENDING_REVIEW'`))?.n,
  );
  const tickets = asInt(
    (await one<{ n: number }>(db, `select count(*)::int as n from support_tickets where status <> 'CLOSED'`))?.n,
  );
  const claims = await many(db, `select * from ops_claims where expires_at > now()`);
  const report = { pendingPay, pendingDel, tickets, claims, at: new Date().toISOString() };
  const id = nid("hnd");
  await db.query(
    `insert into shift_handovers (id, from_admin, report_json) values ($1,$2,$3::jsonb)`,
    [id, opts.admin.id, JSON.stringify(report)],
  );
  return { ok: true as const, id, report };
}

export async function mergeUsers(opts: { admin: AdminRef; keepId: string; dropId: string }) {
  if (opts.keepId === opts.dropId) return { ok: false as const, error: "SAME" };
  const db = await getSql();
  await db.query(`update orders set user_id=$1 where user_id=$2`, [opts.keepId, opts.dropId]);
  await db.query(`update payments set user_id=$1 where user_id=$2`, [opts.keepId, opts.dropId]);
  await db.query(`update support_tickets set user_id=$1 where user_id=$2`, [opts.keepId, opts.dropId]);
  await db.query(`update reviews set user_id=$1 where user_id=$2`, [opts.keepId, opts.dropId]);
  const drop = await one<{ balance_cents: number }>(db, `select balance_cents from shop_users where id=$1`, [
    opts.dropId,
  ]);
  const move = asInt(drop?.balance_cents);
  if (move > 0) {
    await db.query(`update shop_users set balance_cents = balance_cents + $2 where id=$1`, [opts.keepId, move]);
    await db.query(`update shop_users set balance_cents = 0 where id=$1`, [opts.dropId]);
  }
  await db.query(`update shop_users set status='BLOCKED', updated_at=now() where id=$1`, [opts.dropId]);
  await audit(db, {
    actorId: opts.admin.id,
    actorType: "ADMIN",
    action: "user.merge",
    entity: "user",
    entityId: opts.keepId,
    oldValue: { drop: opts.dropId },
  });
  return { ok: true as const };
}

export async function importCsv(opts: { admin: AdminRef; kind: "products" | "couriers" | "promo"; csv: string }) {
  const lines = opts.csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const header = lines.shift();
  if (!header) return { ok: false as const, loaded: 0, skipped: 0, errors: [{ row: 0, error: "empty" }] };
  const cols = header.split(",").map((c) => c.trim().toLowerCase());
  let loaded = 0;
  let skipped = 0;
  const errors: Array<{ row: number; error: string }> = [];
  const db = await getSql();
  for (let i = 0; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    cols.forEach((c, idx) => {
      row[c] = cells[idx] ?? "";
    });
    try {
      if (opts.kind === "products") {
        const name = row.name || row.title;
        const price = Math.round(Number(row.price || row.price_usd || "0") * 100);
        if (!name || !price) {
          skipped += 1;
          errors.push({ row: i + 2, error: "name/price" });
          continue;
        }
        await db.query(
          `insert into products (id, slug, name_i18n, description_i18n, price_cents, stock, status, published, moderation_status)
           values ($1,$2,$3::jsonb,'{}'::jsonb,$4,$5,'DRAFT', false, 'APPROVED')`,
          [
            nid("prd"),
            `${name.toLowerCase().replace(/\s+/g, "-")}-${Date.now().toString(36)}`,
            JSON.stringify({ ru: name, en: name, uz: name }),
            price,
            Number(row.stock || 0),
          ],
        );
        loaded += 1;
      } else if (opts.kind === "promo") {
        const res = await savePromo({
          admin: opts.admin,
          code: row.code,
          kind: (row.kind as "PERCENT") || "PERCENT",
          percent: Number(row.percent || 0),
          valueCents: Math.round(Number(row.value || 0) * 100),
        });
        if (res.ok) loaded += 1;
        else {
          skipped += 1;
          errors.push({ row: i + 2, error: res.error });
        }
      } else {
        skipped += 1;
      }
    } catch (e) {
      skipped += 1;
      errors.push({ row: i + 2, error: e instanceof Error ? e.message : "row" });
    }
  }
  await db.query(
    `insert into import_jobs (id, kind, result_json, created_by) values ($1,$2,$3::jsonb,$4)`,
    [nid("imp"), opts.kind, JSON.stringify({ loaded, skipped, errors }), opts.admin.id],
  );
  return { ok: true as const, loaded, skipped, errors };
}

export async function anomalies() {
  const db = await getSql();
  const pays = await one<{ total: number; rejected: number }>(
    db,
    `select count(*)::int as total,
            count(*) filter (where status='REJECTED')::int as rejected
       from payments where created_at > now() - interval '24 hours'`,
  );
  const total = asInt(pays?.total);
  const rejected = asInt(pays?.rejected);
  const rate = total ? Math.round((rejected / total) * 100) : 0;
  const idleCouriers = await many(
    db,
    `select id, username, first_name, last_location_at from couriers
      where status='ACTIVE' and (last_location_at is null or last_location_at < now() - interval '4 hours')`,
  );
  const burstUsers = await many(
    db,
    `select u.id, u.username, count(*)::int as n
       from orders o join shop_users u on u.id=o.user_id
      where o.created_at > now() - interval '1 hour'
      group by u.id, u.username having count(*) >= 8`,
  );
  const items: Array<{ level: "warn" | "crit"; title: string; href: string }> = [];
  if (rate >= 32) items.push({ level: "crit", title: `Всплеск отказов платежей: ${rate}%`, href: "/admin/payments" });
  for (const c of idleCouriers) {
    items.push({
      level: "warn",
      title: `Курьер @${c.username ?? c.first_name}: нет активности 4ч`,
      href: "/admin/couriers",
    });
  }
  for (const u of burstUsers) {
    items.push({
      level: "crit",
      title: `Пользователь @${u.username} сделал ${u.n} заказов за час`,
      href: "/admin/users",
    });
  }
  return items;
}

export async function scoreUser(userId: string) {
  const db = await getSql();
  const u = await one<{ status: string; registered_at: string }>(
    db,
    `select status, registered_at from shop_users where id=$1`,
    [userId],
  );
  const pendingPays = asInt(
    (await one<{ n: number }>(db, `select count(*)::int as n from payments where user_id=$1 and status='PENDING'`, [userId]))
      ?.n,
  );
  const cancels = asInt(
    (await one<{ n: number }>(db, `select count(*)::int as n from orders where user_id=$1 and status='CANCELLED'`, [userId]))
      ?.n,
  );
  const flags = (
    await many<{ flag: string }>(db, `select flag from risk_flags where entity_type='user' and entity_id=$1`, [userId])
  ).map((f) => String(f.flag));
  return fraudScore({
    registeredAt: u?.registered_at,
    status: u?.status,
    pendingPays,
    cancels,
    flags,
  });
}

export async function snooze(opts: {
  admin: AdminRef;
  entityType: string;
  entityId: string;
  until: string;
  note?: string;
}) {
  const db = await getSql();
  await db.query(
    `insert into ops_snooze (id, entity_type, entity_id, admin_id, until_at, note)
     values ($1,$2,$3,$4,$5,$6)`,
    [nid("snz"), opts.entityType, opts.entityId, opts.admin.id, opts.until, opts.note ?? null],
  );
  return { ok: true };
}

export async function dueSnoozes(adminId: string) {
  const db = await getSql();
  return many(
    db,
    `select * from ops_snooze where admin_id=$1 and until_at <= now() order by until_at desc limit 50`,
    [adminId],
  );
}

export async function listCanned(adminId: string) {
  await ensureOpsSeed();
  const db = await getSql();
  return many(
    db,
    `select * from canned_responses where scope='TEAM' or owner_id=$1 order by created_at`,
    [adminId],
  );
}

export async function saveCanned(opts: { admin: AdminRef; title: string; body: string; scope?: "TEAM" | "PERSONAL" }) {
  const db = await getSql();
  await db.query(
    `insert into canned_responses (id, title, body, scope, owner_id) values ($1,$2,$3,$4,$5)`,
    [nid("cnd"), opts.title.trim(), opts.body.trim(), opts.scope ?? "TEAM", opts.admin.id],
  );
  return { ok: true };
}

export async function card360(kind: "user" | "order" | "courier", id: string) {
  const db = await getSql();
  if (kind === "user") {
    const user = await one(db, `select * from shop_users where id=$1`, [id]);
    if (!user) return null;
    const [orders, pays, tickets, notes, tags, flags, timeline] = await Promise.all([
      many(db, `select * from orders where user_id=$1 order by created_at desc limit 30`, [id]),
      many(db, `select * from payments where user_id=$1 order by created_at desc limit 30`, [id]),
      many(db, `select * from support_tickets where user_id=$1 order by created_at desc`, [id]),
      listNotes("user", id),
      listTags("user", id),
      many(db, `select * from risk_flags where entity_type='user' and entity_id=$1`, [id]),
      entityTimeline("user", id),
    ]);
    const score = await scoreUser(id);
    return { kind, user, orders, pays, tickets, notes, tags, flags, timeline, score };
  }
  if (kind === "order") {
    const order = await one(db, `select * from orders where id=$1`, [id]);
    if (!order) return null;
    const items = await many(db, `select * from order_items where order_id=$1`, [id]);
    const events = await many(db, `select * from order_events where order_id=$1 order by created_at`, [id]);
    const notes = await listNotes("order", id);
    const tags = await listTags("order", id);
    const timeline = await entityTimeline("order", id);
    return { kind, order, items, events, notes, tags, timeline };
  }
  const courier = await one(db, `select * from couriers where id=$1`, [id]);
  if (!courier) return null;
  const tasks = await many(db, `select * from courier_tasks where courier_id=$1 order by created_at desc limit 30`, [id]);
  const payouts = await many(db, `select * from courier_payouts where courier_id=$1 order by created_at desc`, [id]);
  const notes = await listNotes("courier", id);
  const tags = await listTags("courier", id);
  return { kind, courier, tasks, payouts, notes, tags };
}

export async function reconcile() {
  const db = await getSql();
  const ledger = asInt(
    (await one<{ n: number }>(
      db,
      `select coalesce(sum(amount_cents),0)::int as n from ledger_transactions where type in ('DEPOSIT','MANUAL_DEPOSIT')`,
    ))?.n,
  );
  const approved = asInt(
    (await one<{ n: number }>(db, `select coalesce(sum(amount_cents),0)::int as n from payments where status='APPROVED'`))
      ?.n,
  );
  const missingInLedger = await many(
    db,
    `select p.id, p.public_code, p.amount_cents from payments p
      where p.status='APPROVED'
        and not exists (select 1 from ledger_transactions t where t.reference_id=p.id)`,
  );
  const extraInLedger = await many(
    db,
    `select t.id, t.amount_cents, t.reference_id from ledger_transactions t
      where t.type='DEPOSIT' and t.reference_id is not null
        and not exists (select 1 from payments p where p.id=t.reference_id)`,
  );
  return { ledger, provider: approved, missingInLedger, extraInLedger, match: ledger === approved };
}

export async function omniSearch(q: string) {
  const db = await getSql();
  const raw = q.trim();
  const like = `%${raw.replace(/^[@#$]/, "").replace(/^tx:/i, "").replaceAll("%", "").slice(0, 80)}%`;
  const amount = raw.startsWith("$") ? Math.round(Number(raw.slice(1).replace(",", ".")) * 100) : null;
  const [users, orders, products, payments, tickets, couriers, logs] = await Promise.all([
    many(
      db,
      `select id, telegram_id, username, first_name, status from shop_users
        where username ilike $1 or first_name ilike $1 or cast(telegram_id as text) ilike $1 or referral_code ilike $1
        limit 8`,
      [like],
    ),
    many(
      db,
      `select id, public_code, status, total_cents from orders where public_code ilike $1 or id ilike $1 limit 8`,
      [like],
    ),
    many(
      db,
      `select id, slug, name_i18n, status from products where slug ilike $1 or id ilike $1 or name_i18n::text ilike $1 limit 8`,
      [like],
    ),
    many(
      db,
      amount
        ? `select id, public_code, status, amount_cents from payments where amount_cents=$1 limit 8`
        : `select id, public_code, status, amount_cents from payments where public_code ilike $1 or id ilike $1 limit 8`,
      amount ? [amount] : [like],
    ),
    many(
      db,
      `select id, public_code, status, subject from support_tickets where public_code ilike $1 or subject ilike $1 limit 8`,
      [like],
    ),
    many(
      db,
      `select id, username, first_name, telegram_id from couriers where username ilike $1 or first_name ilike $1 or cast(telegram_id as text) ilike $1 limit 8`,
      [like],
    ),
    many(
      db,
      `select id, action, entity, entity_id, created_at from audit_logs
        where action ilike $1 or entity_id ilike $1 or coalesce(entity,'') ilike $1
        order by created_at desc limit 8`,
      [like],
    ),
  ]);
  return { users, orders, products, payments, tickets, couriers, logs };
}

export { nextPublicCode };
