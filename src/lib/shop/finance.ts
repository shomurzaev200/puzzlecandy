import { asInt, many, one, sql as getSql, type Sql } from "./db";
import { nid, nextPublicCode } from "./ids";
import { audit, logError, notify } from "./audit";
import { publish } from "./events";
import { formatMoney } from "./money";
import { t } from "./i18n";
import type { Lang } from "./types";
import { pushTelegram } from "./telegram-notify";

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const db = await getSql();
  const row = await one(db, `select value_json from shop_settings where key=$1`, [key]);
  return row ? (row.value_json as T) : fallback;
}

export async function setSetting(key: string, value: unknown, adminId?: string): Promise<void> {
  const db = await getSql();
  await db.query(
    `insert into shop_settings (key, value_json, updated_by, updated_at)
     values ($1,$2::jsonb,$3,now())
     on conflict (key) do update set value_json=excluded.value_json, updated_by=excluded.updated_by, updated_at=now()`,
    [key, JSON.stringify(value), adminId ?? null],
  );
}

export type PaymentMethod = {
  id: string;
  title: string;
  kind: string;
  details: string;
  comment: string | null;
  status: string;
  sort_order: number;
};

export async function listPaymentMethods() {
  const db = await getSql();
  return many<PaymentMethod>(db, `select * from payment_methods order by sort_order, created_at`);
}

export async function savePaymentMethod(opts: {
  id?: string;
  title: string;
  kind: string;
  details: string;
  comment?: string;
  status?: string;
  sort?: number;
  adminId: string;
}) {
  const db = await getSql();
  const id = opts.id ?? nid("pm");
  if (opts.id) {
    await db.query(
      `update payment_methods set title=$2, kind=$3, details=$4, comment=$5, status=coalesce($6,status), sort_order=coalesce($7,sort_order), updated_at=now() where id=$1`,
      [id, opts.title, opts.kind, opts.details, opts.comment ?? null, opts.status ?? null, opts.sort ?? null],
    );
  } else {
    await db.query(
      `insert into payment_methods (id, title, kind, details, comment, status, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [id, opts.title, opts.kind, opts.details, opts.comment ?? null, opts.status ?? "ACTIVE", opts.sort ?? 0],
    );
  }
  await audit(db, {
    actorId: opts.adminId,
    actorType: "ADMIN",
    action: "payment_method.save",
    entity: "payment_method",
    entityId: id,
  });
  return { id };
}

async function activeMethod(): Promise<PaymentMethod | null> {
  const db = await getSql();
  return (
    (await one<PaymentMethod>(
      db,
      `select * from payment_methods where status='ACTIVE' order by sort_order, created_at limit 1`,
    )) ?? null
  );
}

async function allocatePayAmount(db: Sql, creditCents: number): Promise<number> {
  const taken = await many<{ pay_amount_cents: number }>(
    db,
    `select pay_amount_cents from payments where status in ('PENDING','SUBMITTED','UNDER_REVIEW')`,
  );
  const used = new Set(taken.map((r) => asInt(r.pay_amount_cents)));
  let pay = creditCents;
  while (used.has(pay)) pay += 1;
  return pay;
}

export async function createPaymentRequest(opts: {
  userId: string;
  amountCents: number;
  idempotencyKey?: string;
}): Promise<{
  id: string;
  publicCode: string;
  amountCents: number;
  payAmountCents: number;
  method: PaymentMethod | null;
}> {
  const min = asInt(await getSetting("min_deposit_cents", 500), 500);
  const max = asInt(await getSetting("max_deposit_cents", 100000), 100000);
  if (opts.amountCents < min || opts.amountCents > max) {
    throw new Error(`AMOUNT_RANGE:${min}:${max}`);
  }
  const db = await getSql();
  if (opts.idempotencyKey) {
    const existing = await one<{
      id: string;
      public_code: string;
      amount_cents: number;
      pay_amount_cents: number | null;
    }>(db, `select id, public_code, amount_cents, pay_amount_cents from payments where idempotency_key=$1`, [
      opts.idempotencyKey,
    ]);
    if (existing) {
      const method = await activeMethod();
      return {
        id: existing.id,
        publicCode: existing.public_code,
        amountCents: asInt(existing.amount_cents),
        payAmountCents: asInt(existing.pay_amount_cents ?? existing.amount_cents),
        method,
      };
    }
  }
  const method = await activeMethod();
  const id = nid("pay");
  const code = await nextPublicCode(db, "PAY");
  let lastErr: unknown = null;
  for (let i = 0; i < 25; i += 1) {
    const payAmount = await allocatePayAmount(db, opts.amountCents + i);
    try {
      await db.query(
        `insert into payments (id, public_code, user_id, amount_cents, pay_amount_cents, status, method_id, requisites_snapshot, idempotency_key, expires_at)
         values ($1,$2,$3,$4,$5,'PENDING',$6,$7::jsonb,$8, now() + interval '24 hours')`,
        [
          id,
          code,
          opts.userId,
          opts.amountCents,
          payAmount,
          method?.id ?? null,
          method ? JSON.stringify(method) : null,
          opts.idempotencyKey ?? null,
        ],
      );
      await notify({
        type: "PAYMENT_PENDING",
        title: `Платёж ${code}`,
        body: formatMoney(opts.amountCents),
        entityType: "payment",
        entityId: id,
      });
      publish({
        type: "PAYMENT_PENDING",
        title: `Новый платёж ${code}`,
        body: formatMoney(opts.amountCents),
        entityType: "payment",
        entityId: id,
      });
      return { id, publicCode: code, amountCents: opts.amountCents, payAmountCents: payAmount, method };
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      if (!/unique|duplicate|23505/i.test(msg)) throw err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("PAY_CREATE_FAILED");
}

export async function attachPaymentScreenshot(opts: {
  paymentId?: string;
  publicCode?: string;
  userId: string;
  dataUrl?: string | null;
  telegramFileId?: string | null;
}): Promise<{ ok: true; publicCode: string } | { ok: false; error: string }> {
  const db = await getSql();
  const payment = opts.paymentId
    ? await one<{ id: string; public_code: string; status: string; user_id: string }>(
        db,
        `select id, public_code, status, user_id from payments where id=$1`,
        [opts.paymentId],
      )
    : await one<{ id: string; public_code: string; status: string; user_id: string }>(
        db,
        `select id, public_code, status, user_id from payments where public_code=$1`,
        [opts.publicCode],
      );
  if (!payment) return { ok: false, error: "NOT_FOUND" };
  if (payment.user_id !== opts.userId) return { ok: false, error: "FORBIDDEN" };
  if (payment.status !== "PENDING" && payment.status !== "SUBMITTED") return { ok: false, error: "NOT_PENDING" };
  if (!opts.dataUrl && !opts.telegramFileId) return { ok: false, error: "NO_FILE" };
  if (opts.dataUrl && opts.dataUrl.length > 1_800_000) return { ok: false, error: "TOO_LARGE" };
  await db.query(
    `update payments set screenshot_url=$2, telegram_file_id=$3, status='SUBMITTED', submitted_at=now(), updated_at=now() where id=$1`,
    [payment.id, opts.dataUrl ?? null, opts.telegramFileId ?? null],
  );
  await audit(db, {
    actorId: opts.userId,
    actorType: "USER",
    action: "payment.screenshot",
    entity: "payment",
    entityId: payment.id,
  });
  await notify({
    type: "PAYMENT_SUBMITTED",
    title: `Скриншот ${payment.public_code}`,
    body: "Оплата отправлена на проверку",
    entityType: "payment",
    entityId: payment.id,
  });
  publish({
    type: "PAYMENT_SUBMITTED",
    title: `Скриншот ${payment.public_code}`,
    body: "Оплата на проверке",
    entityType: "payment",
    entityId: payment.id,
  });
  return { ok: true, publicCode: payment.public_code };
}

export async function cancelPayment(opts: { paymentId: string; userId: string }) {
  const db = await getSql();
  const row = await one<{ id: string }>(
    db,
    `update payments set status='CANCELLED', updated_at=now()
      where id=$1 and user_id=$2 and status in ('PENDING','SUBMITTED')
      returning id`,
    [opts.paymentId, opts.userId],
  );
  return { ok: Boolean(row) };
}

export async function reviewPayment(opts: {
  paymentId: string;
  adminId: string;
  decision: "APPROVED" | "REJECTED";
  reason?: string;
}): Promise<{ ok: true; duplicate?: boolean; balance?: number } | { ok: false; error: string }> {
  const db = await getSql();
  if (opts.decision === "REJECTED") {
    if (!opts.reason?.trim()) return { ok: false, error: "REASON_REQUIRED" };
    const updated = await one<{ id: string; user_id: string; public_code: string }>(
      db,
      `update payments set status='REJECTED', reviewed_by=$2, reviewed_at=now(), reject_reason=$3, updated_at=now()
       where id=$1 and status in ('PENDING','SUBMITTED','UNDER_REVIEW')
       returning id, user_id, public_code`,
      [opts.paymentId, opts.adminId, opts.reason],
    );
    if (!updated) {
      const current = await one<{ status: string }>(db, `select status from payments where id=$1`, [opts.paymentId]);
      if (current?.status === "REJECTED") return { ok: true, duplicate: true };
      return { ok: false, error: "NOT_PENDING" };
    }
    await audit(db, {
      actorId: opts.adminId,
      actorType: "ADMIN",
      action: "payment.reject",
      entity: "payment",
      entityId: opts.paymentId,
      newValue: { reason: opts.reason },
    });
    const user = await one<{ telegram_id: number }>(db, `select telegram_id from shop_users where id=$1`, [updated.user_id]);
    if (user) {
      await pushTelegram(
        asInt(user.telegram_id),
        `❌ Оплата отклонена.\nЗаявка: ${updated.public_code}\nПричина:\n${opts.reason}`,
      );
    }
    return { ok: true };
  }

  const txnId = nid("txn");
  const claimed = await one<{
    user_id: string;
    amount_cents: number;
    public_code: string;
    balance_cents: number;
    payment_id: string;
  }>(
    db,
    `with claimed as (
       update payments
          set status='APPROVED', reviewed_by=$2, reviewed_at=now(), updated_at=now()
        where id=$1 and status in ('PENDING','SUBMITTED','UNDER_REVIEW')
       returning id, user_id, amount_cents, public_code
     ), moved as (
       update shop_users u
          set balance_cents = u.balance_cents + c.amount_cents, updated_at=now()
         from claimed c
        where u.id = c.user_id
       returning u.balance_cents, c.id as payment_id, c.user_id, c.amount_cents, c.public_code
     ), booked as (
       insert into ledger_transactions
         (id, user_id, amount_cents, type, balance_before, balance_after, reference_id, reason, admin_id)
       select $3, user_id, amount_cents, 'DEPOSIT', balance_cents - amount_cents, balance_cents, payment_id, 'Payment approved', $2
         from moved
       returning id
     )
     select m.user_id, m.amount_cents, m.balance_cents, m.public_code, m.payment_id
       from moved m, booked`,
    [opts.paymentId, opts.adminId, txnId],
  );
  if (!claimed) {
    const current = await one<{ status: string }>(db, `select status from payments where id=$1`, [opts.paymentId]);
    if (current?.status === "APPROVED") return { ok: true, duplicate: true };
    return { ok: false, error: "NOT_PENDING" };
  }

  const after = asInt(claimed.balance_cents);
  await maybeReferralBonus(db, claimed.user_id, claimed.amount_cents, opts.adminId);
  await audit(db, {
    actorId: opts.adminId,
    actorType: "ADMIN",
    action: "payment.approve",
    entity: "payment",
    entityId: claimed.payment_id,
    newValue: { amount: claimed.amount_cents, balance: after },
  });
  const user = await one<{ telegram_id: number }>(db, `select telegram_id from shop_users where id=$1`, [claimed.user_id]);
  if (user) {
    await pushTelegram(
      asInt(user.telegram_id),
      `✅ Оплата подтверждена.\nЗаявка: ${claimed.public_code}\nСумма: ${formatMoney(claimed.amount_cents)}\nБаланс пополнен: ${formatMoney(after)}`,
    );
  }
  return { ok: true, balance: after };
}

async function maybeReferralBonus(db: Sql, userId: string, depositCents: number, adminId: string) {
  const user = await one<{ referred_by: string | null }>(db, `select referred_by from shop_users where id=$1`, [userId]);
  if (!user?.referred_by) return;
  const percent = asInt(await getSetting("referral_percent", 5), 5);
  if (percent <= 0) return;
  const bonus = Math.round((depositCents * percent) / 100);
  if (bonus <= 0) return;
  const existing = await one<{ id: string }>(
    db,
    `select id from referrals where referee_id=$1 and status='PAID'`,
    [userId],
  );
  if (existing) return;
  const moved = await one<{ balance_cents: number }>(
    db,
    `update shop_users
     set balance_cents = balance_cents + $2, referral_earned_cents = referral_earned_cents + $2, updated_at=now()
     where id=$1 returning balance_cents`,
    [user.referred_by, bonus],
  );
  const after = asInt(moved?.balance_cents);
  await db.query(
    `insert into ledger_transactions
      (id, user_id, amount_cents, type, balance_before, balance_after, reference_id, reason, admin_id)
     values ($1,$2,$3,'REFERRAL',$4,$5,$6,'Referral bonus',$7)`,
    [nid("txn"), user.referred_by, bonus, after - bonus, after, userId, adminId],
  );
  await db.query(
    `insert into referrals (id, referrer_id, referee_id, amount_cents, status) values ($1,$2,$3,$4,'PAID')`,
    [nid("ref"), user.referred_by, userId, bonus],
  );
}

export async function manualBalance(opts: {
  userId: string;
  adminId: string;
  amountCents: number;
  type: "MANUAL_DEPOSIT" | "MANUAL_WITHDRAW" | "BONUS" | "ADJUSTMENT";
  reason: string;
  comment?: string;
}): Promise<{ ok: true; balance: number } | { ok: false; error: string }> {
  if (!opts.reason.trim()) return { ok: false, error: "REASON_REQUIRED" };
  if (!Number.isFinite(opts.amountCents) || opts.amountCents === 0) return { ok: false, error: "BAD_AMOUNT" };
  const db = await getSql();
  const delta =
    opts.type === "MANUAL_WITHDRAW" ? -Math.abs(opts.amountCents) : Math.abs(opts.amountCents);
  const moved =
    delta < 0
      ? await one<{ balance_cents: number }>(
          db,
          `update shop_users set balance_cents = balance_cents + $2, updated_at=now()
           where id=$1 and balance_cents >= $3 returning balance_cents`,
          [opts.userId, delta, -delta],
        )
      : await one<{ balance_cents: number }>(
          db,
          `update shop_users set balance_cents = balance_cents + $2, updated_at=now()
           where id=$1 returning balance_cents`,
          [opts.userId, delta],
        );
  if (!moved) return { ok: false, error: "INSUFFICIENT" };
  const after = asInt(moved.balance_cents);
  const before = after - delta;
  await db.query(
    `insert into ledger_transactions
      (id, user_id, amount_cents, type, balance_before, balance_after, reference_id, reason, comment, admin_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      nid("txn"),
      opts.userId,
      delta,
      opts.type,
      before,
      after,
      null,
      opts.reason,
      opts.comment ?? null,
      opts.adminId,
    ],
  );
  await audit(db, {
    actorId: opts.adminId,
    actorType: "ADMIN",
    action: "user.balance",
    entity: "user",
    entityId: opts.userId,
    newValue: { delta, type: opts.type, reason: opts.reason, after },
  });
  return { ok: true, balance: after };
}

export async function listPayments(filter: {
  status?: string;
  q?: string;
  limit?: number;
  offset?: number;
}) {
  const db = await getSql();
  const limit = Math.min(filter.limit ?? 50, 200);
  const offset = filter.offset ?? 0;
  const params: unknown[] = [];
  const where: string[] = ["1=1"];
  if (filter.status && filter.status !== "ALL") {
    params.push(filter.status);
    where.push(`p.status=$${params.length}`);
  }
  if (filter.q) {
    params.push(`%${filter.q.replaceAll("%", "")}%`);
    const i = params.length;
    where.push(
      `(p.public_code ilike $${i} or u.username ilike $${i} or coalesce(u.first_name,'') ilike $${i} or cast(u.telegram_id as text) ilike $${i})`,
    );
  }
  params.push(limit, offset);
  return many(
    db,
    `select p.*, u.telegram_id, u.username, u.first_name, u.balance_cents as user_balance
     from payments p join shop_users u on u.id=p.user_id
     where ${where.join(" and ")}
     order by p.created_at desc
     limit $${params.length - 1} offset $${params.length}`,
    params,
  );
}

export function paymentNotice(lang: Lang, kind: "approved" | "rejected", amount: number, balance: number) {
  if (kind === "approved") return t("payment_approved", lang, { amount: formatMoney(amount), balance: formatMoney(balance) });
  return t("payment_rejected", lang);
}

export async function safeFinance<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    await logError(null, {
      level: "ERROR",
      service: "finance",
      event: label,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
