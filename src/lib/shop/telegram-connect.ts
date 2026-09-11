import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { asInt, many, one, sql as getSql } from "./db";
import { nid } from "./ids";
import { audit, logError } from "./audit";
import { getSetting, setSetting } from "./finance";

export type BotPurpose = "main" | "payment" | "courier" | "support" | "other";
export type AccountPurpose = "payment" | "operator" | "courier" | "support" | "work" | "other";

function maskToken(token: string): string {
  if (token.length < 8) return "••••••••";
  return `${"•".repeat(18)}${token.slice(-4)}`;
}

function fingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

function safeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

async function telegramApi(token: string, method: string, body?: Record<string, unknown>) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const res = await fetch(url, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const json = (await res.json().catch(() => null)) as
    | { ok: boolean; result?: Record<string, unknown>; description?: string }
    | null;
  if (!json || !json.ok) {
    const err = new Error("TELEGRAM_UNREACHABLE");
    (err as Error & { detail?: string }).detail = json?.description ?? `HTTP ${res.status}`;
    throw err;
  }
  return json.result ?? {};
}

export async function verifyTelegramToken(token: string): Promise<{
  ok: true;
  username: string;
  title: string;
  telegramId: number;
} | { ok: false; error: string }> {
  const trimmed = token.trim();
  if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(trimmed)) {
    return { ok: false, error: "Некорректный формат токена." };
  }
  try {
    const me = await telegramApi(trimmed, "getMe");
    return {
      ok: true,
      username: typeof me.username === "string" ? me.username : "unknown",
      title: typeof me.first_name === "string" ? me.first_name : "Bot",
      telegramId: Number(me.id) || 0,
    };
  } catch (err) {
    const detail = (err as Error & { detail?: string }).detail;
    return { ok: false, error: detail ? `Telegram: ${detail}` : "Не удалось проверить токен. Проверьте значение." };
  }
}

async function originHint(): Promise<string | null> {
  const secrets = await getSetting<{ public_origin?: string }>("secrets", {});
  if (secrets.public_origin) return secrets.public_origin.replace(/\/$/, "");
  const host = process.env.APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  if (!host) return null;
  return host.startsWith("http") ? host.replace(/\/$/, "") : `https://${host}`;
}

export async function saveVerifiedBot(opts: {
  adminId: string;
  id?: string;
  title: string;
  purpose: BotPurpose;
  token: string;
  info: { username: string; title: string; telegramId: number };
}): Promise<{ id: string; username: string; telegramId: number; status: string; webhook: boolean }> {
  const db = await getSql();
  let id = opts.id ?? nid("bot");
  if (!opts.id && opts.purpose !== "other") {
    const existing = await one<{ id: string }>(db, `select id from bot_accounts where kind=$1`, [opts.purpose]);
    if (existing) id = existing.id;
  }
  const fp = fingerprint(opts.token);
  const title = opts.title.trim() || opts.info.title;
  await db.query(
    `insert into bot_accounts (id, kind, title, username, telegram_id, token_set, token_fingerprint, purpose, status, last_check_at, updated_at)
     values ($1,$2,$3,$4,$5,true,$6,$2,'ONLINE', now(), now())
     on conflict (id) do update set
       kind=excluded.kind, title=excluded.title, username=excluded.username, telegram_id=excluded.telegram_id,
       token_set=true, token_fingerprint=excluded.token_fingerprint, purpose=excluded.purpose,
       status='ONLINE', last_error=null, last_check_at=now(), updated_at=now()`,
    [id, opts.purpose, title, opts.info.username, opts.info.telegramId, fp],
  );
  await db.query(
    `insert into bot_secrets (bot_id, token_enc, updated_at) values ($1,$2,now())
     on conflict (bot_id) do update set token_enc=excluded.token_enc, updated_at=now()`,
    [id, opts.token.trim()],
  );
  let webhook = false;
  const origin = await originHint();
  if (origin) {
    try {
      const url = `${origin.replace(/\/$/, "")}/api/telegram/${id}`;
      await telegramApi(opts.token.trim(), "setWebhook", { url, drop_pending_updates: false });
      await db.query(`update bot_accounts set webhook_url=$2, last_webhook_at=now() where id=$1`, [id, url]);
      webhook = true;
    } catch (err) {
      const detail = (err as Error & { detail?: string }).detail ?? "webhook failed";
      await db.query(`update bot_accounts set last_error=$2 where id=$1`, [id, detail]);
    }
  }
  await audit(db, {
    actorId: opts.adminId,
    actorType: "ADMIN",
    action: opts.id ? "bot.update" : "bot.connect",
    entity: "bot",
    entityId: id,
    newValue: { username: opts.info.username, purpose: opts.purpose, telegramId: opts.info.telegramId },
  });
  return { id, username: opts.info.username, telegramId: opts.info.telegramId, status: "ONLINE", webhook };
}

export async function listBots() {
  const db = await getSql();
  return many(
    db,
    `select id, kind, title, username, telegram_id, token_set, token_fingerprint, webhook_url,
            last_webhook_at, last_update_at, last_check_at, last_error, status, purpose, updated_at
     from bot_accounts order by
       case kind when 'main' then 0 when 'payment' then 1 when 'courier' then 2 when 'support' then 3 else 4 end,
       updated_at desc`,
  );
}

export async function revealBotToken(botId: string): Promise<string | null> {
  const db = await getSql();
  const row = await one<{ token_enc: string }>(db, `select token_enc from bot_secrets where bot_id=$1`, [botId]);
  return row?.token_enc ?? null;
}

export async function checkBotNow(botId: string, adminId: string) {
  const db = await getSql();
  const secret = await one<{ token_enc: string }>(db, `select token_enc from bot_secrets where bot_id=$1`, [botId]);
  if (!secret) {
    await db.query(`update bot_accounts set status='OFFLINE', last_check_at=now(), last_error='Токен не задан' where id=$1`, [botId]);
    return { ok: false, error: "Токен не задан — бот работает в симуляторе." };
  }
  const verified = await verifyTelegramToken(secret.token_enc);
  if (!verified.ok) {
    await db.query(`update bot_accounts set status='ERROR', last_check_at=now(), last_error=$2 where id=$1`, [botId, verified.error]);
    await logError(db, { service: "telegram", event: "bot.check", message: verified.error });
    await audit(db, { actorId: adminId, actorType: "ADMIN", action: "bot.check", entity: "bot", entityId: botId, newValue: { ok: false } });
    return verified;
  }
  await db.query(
    `update bot_accounts set status='ONLINE', username=$2, telegram_id=$3, last_error=null, last_check_at=now(), updated_at=now() where id=$1`,
    [botId, verified.username, verified.telegramId],
  );
  await audit(db, { actorId: adminId, actorType: "ADMIN", action: "bot.check", entity: "bot", entityId: botId, newValue: { ok: true, username: verified.username } });
  return verified;
}

export async function reconnectBot(botId: string, adminId: string) {
  const checked = await checkBotNow(botId, adminId);
  if (!checked.ok) return checked;
  const db = await getSql();
  const secret = await one<{ token_enc: string }>(db, `select token_enc from bot_secrets where bot_id=$1`, [botId]);
  if (!secret) return { ok: false as const, error: "Токен не задан" };
  const origin = await originHint();
  if (origin) {
    try {
      const url = `${origin.replace(/\/$/, "")}/api/telegram/${botId}`;
      await telegramApi(secret.token_enc, "setWebhook", { url, drop_pending_updates: false });
      await db.query(`update bot_accounts set webhook_url=$2, last_webhook_at=now(), last_error=null, status='ONLINE' where id=$1`, [
        botId,
        url,
      ]);
    } catch (err) {
      const detail = (err as Error & { detail?: string }).detail ?? "webhook failed";
      await db.query(`update bot_accounts set last_error=$2 where id=$1`, [botId, detail]);
      return { ok: false as const, error: detail };
    }
  }
  await audit(db, { actorId: adminId, actorType: "ADMIN", action: "bot.reconnect", entity: "bot", entityId: botId });
  return checked;
}

export async function setBotEnabled(botId: string, enabled: boolean, adminId: string) {
  const db = await getSql();
  const secret = await one<{ token_enc: string }>(db, `select token_enc from bot_secrets where bot_id=$1`, [botId]);
  if (!enabled && secret) {
    try {
      await telegramApi(secret.token_enc, "deleteWebhook", { drop_pending_updates: false });
    } catch {
      /* still disable locally */
    }
  }
  await db.query(
    `update bot_accounts set status=$2, updated_at=now() where id=$1`,
    [botId, enabled ? "ONLINE" : "OFFLINE"],
  );
  await audit(db, {
    actorId: adminId,
    actorType: "ADMIN",
    action: enabled ? "bot.enable" : "bot.disable",
    entity: "bot",
    entityId: botId,
  });
  return { ok: true };
}

export async function deleteBot(botId: string, adminId: string) {
  const db = await getSql();
  const secret = await one<{ token_enc: string }>(db, `select token_enc from bot_secrets where bot_id=$1`, [botId]);
  if (secret) {
    try {
      await telegramApi(secret.token_enc, "deleteWebhook", { drop_pending_updates: true });
    } catch {
      /* continue */
    }
  }
  await db.query(`delete from bot_secrets where bot_id=$1`, [botId]);
  await db.query(`delete from bot_accounts where id=$1`, [botId]);
  await audit(db, { actorId: adminId, actorType: "ADMIN", action: "bot.delete", entity: "bot", entityId: botId });
  return { ok: true };
}

export async function listTelegramAccounts() {
  const db = await getSql();
  return many(db, `select * from telegram_user_accounts order by created_at desc`);
}

export async function startQrSession(purpose: AccountPurpose) {
  const db = await getSql();
  const id = nid("tga");
  const payload = `puzzlcandy://tg-auth/${id}/${randomBytes(12).toString("hex")}`;
  await db.query(
    `insert into telegram_auth_sessions (id, method, purpose, status, qr_payload, expires_at)
     values ($1,'qr',$2,'PENDING',$3, now() + interval '5 minutes')`,
    [id, purpose, payload],
  );
  return { id, qrPayload: payload, expiresIn: 300 };
}

export async function pollAuthSession(id: string) {
  const db = await getSql();
  const row = await one<{
    id: string;
    status: string;
    completed_account_id: string | null;
    expires_at: string;
    qr_payload: string | null;
    method: string;
  }>(db, `select * from telegram_auth_sessions where id=$1`, [id]);
  if (!row) return { status: "ERROR" as const };
  if (row.status !== "CONNECTED" && new Date(row.expires_at).getTime() < Date.now()) {
    await db.query(`update telegram_auth_sessions set status='EXPIRED' where id=$1 and status<>'CONNECTED'`, [id]);
    return { status: "EXPIRED" as const };
  }
  let account = null;
  if (row.completed_account_id) {
    account = await one(db, `select * from telegram_user_accounts where id=$1`, [row.completed_account_id]);
  }
  return { status: row.status, account, qrPayload: row.qr_payload, method: row.method };
}

function fakeProfile(phone?: string) {
  const telegramId = 400000000 + Math.floor(Math.random() * 200000000);
  const last = String(telegramId).slice(-4);
  return {
    telegramId,
    displayName: phone ? `Аккаунт ${phone.slice(-4)}` : `Оператор ${last}`,
    username: `pc_${last}`,
  };
}

export async function completeQrSession(sessionId: string, adminId: string) {
  const db = await getSql();
  const session = await one<{ id: string; status: string; purpose: string; expires_at: string }>(
    db,
    `select * from telegram_auth_sessions where id=$1`,
    [sessionId],
  );
  if (!session) return { ok: false as const, error: "Сессия не найдена" };
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await db.query(`update telegram_auth_sessions set status='EXPIRED' where id=$1`, [sessionId]);
    return { ok: false as const, error: "QR-код истёк. Создайте новый." };
  }
  const profile = fakeProfile();
  const accId = nid("tgu");
  await db.query(
    `insert into telegram_user_accounts
       (id, display_name, username, telegram_id, purpose, status, session_set, last_activity_at, last_check_at, updated_at)
     values ($1,$2,$3,$4,$5,'CONNECTED', true, now(), now(), now())`,
    [accId, profile.displayName, profile.username, profile.telegramId, session.purpose ?? "other"],
  );
  await db.query(
    `update telegram_auth_sessions set status='CONNECTED', completed_account_id=$2 where id=$1`,
    [sessionId, accId],
  );
  await audit(db, {
    actorId: adminId,
    actorType: "ADMIN",
    action: "telegram.account.connect",
    entity: "telegram_account",
    entityId: accId,
    newValue: { method: "qr", username: profile.username, telegramId: profile.telegramId },
  });
  const account = await one(db, `select * from telegram_user_accounts where id=$1`, [accId]);
  return { ok: true as const, account };
}

export async function startPhoneSession(phone: string, purpose: AccountPurpose) {
  const cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.replace(/\D/g, "").length < 8) return { ok: false as const, error: "Введите номер телефона." };
  const db = await getSql();
  const id = nid("tga");
  const code = String(10000 + Math.floor(Math.random() * 90000));
  await db.query(
    `insert into telegram_auth_sessions (id, method, phone, purpose, status, code_hash, expires_at)
     values ($1,'phone',$2,$3,'CODE_SENT',$4, now() + interval '5 minutes')`,
    [id, cleaned, purpose, hashCode(code)],
  );
  return { ok: true as const, id, demoCode: code };
}

export async function verifyPhoneCode(sessionId: string, code: string, adminId: string) {
  const db = await getSql();
  const session = await one<{
    id: string;
    status: string;
    purpose: string;
    phone: string | null;
    code_hash: string | null;
    expires_at: string;
  }>(db, `select * from telegram_auth_sessions where id=$1`, [sessionId]);
  if (!session || !session.code_hash) return { ok: false as const, error: "Сессия не найдена" };
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await db.query(`update telegram_auth_sessions set status='EXPIRED' where id=$1`, [sessionId]);
    return { ok: false as const, error: "Код истёк." };
  }
  if (!safeEqualHex(session.code_hash, hashCode(code.trim()))) {
    return { ok: false as const, error: "Неверный код." };
  }
  const profile = fakeProfile(session.phone ?? undefined);
  const accId = nid("tgu");
  await db.query(
    `insert into telegram_user_accounts
       (id, display_name, username, telegram_id, phone_masked, purpose, status, session_set, last_activity_at, last_check_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,'CONNECTED', true, now(), now(), now())`,
    [
      accId,
      profile.displayName,
      profile.username,
      profile.telegramId,
      session.phone ? `${session.phone.slice(0, 4)}••••${session.phone.slice(-2)}` : null,
      session.purpose ?? "other",
    ],
  );
  await db.query(`update telegram_auth_sessions set status='CONNECTED', completed_account_id=$2 where id=$1`, [sessionId, accId]);
  await audit(db, {
    actorId: adminId,
    actorType: "ADMIN",
    action: "telegram.account.connect",
    entity: "telegram_account",
    entityId: accId,
    newValue: { method: "phone", username: profile.username },
  });
  const account = await one(db, `select * from telegram_user_accounts where id=$1`, [accId]);
  return { ok: true as const, account };
}

export async function setAccountPurpose(id: string, purpose: AccountPurpose, adminId: string) {
  const db = await getSql();
  await db.query(`update telegram_user_accounts set purpose=$2, updated_at=now() where id=$1`, [id, purpose]);
  await audit(db, { actorId: adminId, actorType: "ADMIN", action: "telegram.account.purpose", entity: "telegram_account", entityId: id, newValue: { purpose } });
  return { ok: true };
}

export async function setAccountStatus(id: string, status: "CONNECTED" | "DISABLED" | "NEED_AUTH", adminId: string) {
  const db = await getSql();
  await db.query(`update telegram_user_accounts set status=$2, updated_at=now() where id=$1`, [id, status]);
  await audit(db, { actorId: adminId, actorType: "ADMIN", action: "telegram.account.status", entity: "telegram_account", entityId: id, newValue: { status } });
  return { ok: true };
}

export async function deleteAccount(id: string, adminId: string) {
  const db = await getSql();
  await db.query(`delete from telegram_user_accounts where id=$1`, [id]);
  const routing = await getSetting<Record<string, string | null>>("telegram_routing", {});
  const next = { ...routing };
  for (const [k, v] of Object.entries(next)) {
    if (v === id) next[k] = null;
  }
  await setSetting("telegram_routing", next, adminId);
  await audit(db, { actorId: adminId, actorType: "ADMIN", action: "telegram.account.delete", entity: "telegram_account", entityId: id });
  return { ok: true };
}

export async function checkAccountNow(id: string, adminId: string) {
  const db = await getSql();
  const acc = await one<{ status: string; session_set: boolean }>(db, `select status, session_set from telegram_user_accounts where id=$1`, [id]);
  if (!acc) return { ok: false, error: "Не найден" };
  if (!acc.session_set) {
    await db.query(`update telegram_user_accounts set status='NEED_AUTH', last_check_at=now(), last_error='Нет сессии' where id=$1`, [id]);
    return { ok: false, error: "Требуется повторное подключение Telegram-аккаунта" };
  }
  await db.query(`update telegram_user_accounts set status='CONNECTED', last_check_at=now(), last_error=null, last_activity_at=now() where id=$1`, [id]);
  await audit(db, { actorId: adminId, actorType: "ADMIN", action: "telegram.account.check", entity: "telegram_account", entityId: id });
  return { ok: true };
}

export type TelegramRouting = {
  payment_account_id: string | null;
  courier_bot_id: string | null;
  courier_account_id: string | null;
  support_bot_id: string | null;
  payment_bot_id: string | null;
  main_bot_id: string | null;
};

export async function getRouting(): Promise<TelegramRouting> {
  const stored = await getSetting<Partial<TelegramRouting>>("telegram_routing", {});
  return {
    payment_account_id: stored.payment_account_id ?? null,
    courier_bot_id: stored.courier_bot_id ?? null,
    courier_account_id: stored.courier_account_id ?? null,
    support_bot_id: stored.support_bot_id ?? null,
    payment_bot_id: stored.payment_bot_id ?? null,
    main_bot_id: stored.main_bot_id ?? null,
  };
}

export async function saveRouting(next: Partial<TelegramRouting>, adminId: string) {
  const current = await getRouting();
  const merged = { ...current, ...next };
  await setSetting("telegram_routing", merged, adminId);
  await audit(null, { actorId: adminId, actorType: "ADMIN", action: "telegram.routing", entity: "settings", newValue: merged });
  return merged;
}

export function tokenMask(token: string): string {
  return maskToken(token);
}

export { asInt };
