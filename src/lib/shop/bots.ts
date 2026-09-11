import { asInt, asJson, many, one, sql as getSql } from "./db";
import { nid } from "./ids";
import { t, pickI18n, langFromCode } from "./i18n";
import { formatMoney, parseMoneyToCents, DEPOSIT_PRESETS_CENTS } from "./money";
import { dealsCount, setLanguage, upsertShopUser } from "./users";
import {
  attachPaymentScreenshot,
  cancelPayment,
  createPaymentRequest,
  getSetting,
} from "./finance";
import { getOrCreateKycDraft, patchKyc, submitKyc } from "./kyc";
import {
  addReview,
  getProduct,
  listCategories,
  listPublishedProducts,
  productTitle,
  purchaseProduct,
  quotePrice,
} from "./commerce";
import {
  addReportPhoto,
  respondTask,
  saveLocation,
  setCourierAvailability,
  submitReport,
  upsertCourier,
} from "./logistics";
import { applyJob, openTicket } from "./support";
import { logError } from "./audit";
import type { BotIncoming, BotKind, BotReply, InlineButton, KeyboardButton, Lang, Json } from "./types";

type Session = {
  id: string;
  bot: string;
  telegram_id: number;
  user_id: string | null;
  courier_id: string | null;
  language: Lang;
  state: string;
  payload: Record<string, Json>;
};

async function loadSession(bot: BotKind, telegramId: number): Promise<Session> {
  const db = await getSql();
  const row = await one<Session>(
    db,
    `select * from bot_sessions where bot=$1 and telegram_id=$2`,
    [bot, telegramId],
  );
  if (row) return { ...row, payload: asJson(row.payload, {} as Record<string, Json>), language: (row.language as Lang) || "ru" };
  const created = await one<Session>(
    db,
    `insert into bot_sessions (id, bot, telegram_id, language, state, payload)
     values ($1,$2,$3,'ru','BOOT','{}') returning *`,
    [nid("ses"), bot, telegramId],
  );
  return { ...created!, payload: {}, language: "ru" };
}

async function saveSession(s: Session) {
  const db = await getSql();
  await db.query(
    `update bot_sessions set user_id=$2, courier_id=$3, language=$4, state=$5, payload=$6::jsonb, updated_at=now() where id=$1`,
    [s.id, s.user_id, s.courier_id, s.language, s.state, JSON.stringify(s.payload ?? {})],
  );
}

async function logMsg(bot: BotKind, telegramId: number, direction: "IN" | "OUT", text: string, payload?: unknown) {
  const db = await getSql();
  await db.query(
    `insert into bot_messages (id, bot, telegram_id, direction, text, payload) values ($1,$2,$3,$4,$5,$6::jsonb)`,
    [nid("bmg"), bot, telegramId, direction, text, payload ? JSON.stringify(payload) : null],
  );
}

function reply(messages: BotReply["messages"], extra?: Partial<BotReply>): BotReply {
  return { messages, keyboard: extra?.keyboard, requestPhoto: extra?.requestPhoto, requestLocation: extra?.requestLocation };
}

function navKb(lang: Lang): KeyboardButton[][] {
  return [[{ text: t("btn_back", lang) }, { text: t("btn_home", lang) }]];
}

function mainKb(lang: Lang): KeyboardButton[][] {
  return [
    [{ text: t("btn_catalog", lang) }],
    [{ text: t("btn_deposit", lang) }],
    [{ text: t("btn_jobs", lang) }, { text: t("btn_reviews", lang) }],
    [{ text: t("btn_kyc", lang) }],
    [{ text: t("btn_rules", lang) }, { text: t("btn_info", lang) }],
    [{ text: t("btn_orders", lang) }],
    [{ text: t("btn_help", lang) }],
    [{ text: t("btn_lang", lang) }],
    [{ text: t("btn_exchange", lang) }],
    [{ text: t("btn_connect_bot", lang) }],
  ];
}

function langKb(): KeyboardButton[][] {
  return [[{ text: "🇷🇺 Русский" }], [{ text: "🇺🇿 O'zbekcha" }], [{ text: "🇬🇧 English" }]];
}

function parseLangButton(text: string): Lang | null {
  const n = text.replace(/^[^\p{L}\p{N}]+/u, "").trim().toLowerCase();
  if (n === "русский" || n === "russian" || n.startsWith("русск")) return "ru";
  if (n.startsWith("o'zbek") || n.startsWith("o‘zbek") || n.startsWith("uzbek")) return "uz";
  if (n === "english" || n.startsWith("english")) return "en";
  return null;
}

function isCmd(text: string | null | undefined, lang: Lang, key: string) {
  if (!text) return false;
  const strip = (s: string) => s.replace(/^[^\p{L}\p{N}]+/u, "").trim().toLowerCase();
  const a = strip(text);
  const label = t(key, lang);
  return a === strip(label) || text.includes(label);
}

function inline(rows: InlineButton[][]): InlineButton[][] {
  return rows;
}

async function welcome(lang: Lang, userId: string): Promise<string> {
  const db = await getSql();
  const u = await one<{
    balance_cents: number;
    purchases_count: number;
    discount_percent: number;
  }>(db, `select balance_cents, purchases_count, discount_percent from shop_users where id=$1`, [userId]);
  const deals = await dealsCount();
  return t("welcome", lang, {
    deals: String(deals).padStart(4, "0"),
    balance: formatMoney(asInt(u?.balance_cents)),
    purchases: asInt(u?.purchases_count),
    discount: asInt(u?.discount_percent),
  });
}

export async function dispatchBot(input: BotIncoming): Promise<BotReply> {
  const inbound =
    input.text ||
    (input.photoDataUrl ? "📷 screenshot" : input.location ? "📍 location" : null);
  if (inbound) {
    await logMsg(input.bot, input.telegramId, "IN", inbound, {
      callback: input.callbackData,
      hasPhoto: Boolean(input.photoDataUrl),
      location: input.location,
    });
  }
  const session = await loadSession(input.bot, input.telegramId);
  let out: BotReply;
  try {
    if (input.bot === "payment") out = await handlePaymentBot(session, input);
    else if (input.bot === "courier") out = await handleCourierBot(session, input);
    else out = await handleMainBot(session, input);
  } catch (err) {
    await logError(null, {
      level: "ERROR",
      service: "telegram",
      event: "dispatch",
      message: err instanceof Error ? err.message : String(err),
      context: { bot: input.bot, telegramId: input.telegramId },
    });
    out = reply([{ text: t("handler_error", session.language) }]);
  }
  await saveSession(session);
  for (const m of out.messages) {
    await logMsg(input.bot, input.telegramId, "OUT", m.text, { inline: m.inline, photo: m.photoUrl });
  }
  return out;
}

async function handleMainBot(s: Session, input: BotIncoming): Promise<BotReply> {
  const user = await upsertShopUser({
    telegramId: input.telegramId,
    username: input.username,
    firstName: input.firstName,
    lastName: input.lastName,
    language: s.language,
    startPayload: input.startPayload,
  });
  s.user_id = user.id;
  if (user.status === "BLOCKED") {
    return reply([{ text: t("blocked", s.language) }], { keyboard: mainKb(s.language) });
  }
  const text = (input.text ?? "").trim();
  const cb = input.callbackData ?? "";
  const start = text === "/start" || s.state === "BOOT";

  if (start && (s.state === "BOOT" || s.state === "LANG") && !s.payload.langSet) {
    s.state = "LANG";
    return reply([{ text: t("choose_language", "ru") }], { keyboard: langKb() });
  }
  if (text === "/start") {
    s.state = "MAIN";
    return reply([{ text: await welcome(s.language, user.id) }], { keyboard: mainKb(s.language) });
  }

  const pickedLang = parseLangButton(text);
  if (s.state === "LANG") {
    if (pickedLang) {
      s.language = pickedLang;
      s.payload = { ...s.payload, langSet: true };
      await setLanguage(user.id, pickedLang);
      s.state = "MAIN";
      return reply([{ text: await welcome(s.language, user.id) }], { keyboard: mainKb(s.language) });
    }
    return reply([{ text: t("choose_language", s.language) }], { keyboard: langKb() });
  }
  if (isCmd(text, s.language, "btn_lang")) {
    s.state = "LANG";
    return reply([{ text: t("choose_language", s.language) }], { keyboard: langKb() });
  }

  if (isCmd(text, s.language, "btn_home") || text === "/menu") {
    s.state = "MAIN";
    s.payload = {};
    return reply([{ text: await welcome(s.language, user.id) }], { keyboard: mainKb(s.language) });
  }
  if (isCmd(text, s.language, "btn_back")) {
    s.state = "MAIN";
    return reply([{ text: await welcome(s.language, user.id) }], { keyboard: mainKb(s.language) });
  }

  if (cb.startsWith("cat:")) return showCategory(s, user.id, cb.slice(4));
  if (cb.startsWith("prd:")) return showProduct(s, user.id, cb.slice(4));
  if (cb.startsWith("buy:")) return confirmBuy(s, user.id, cb.slice(4));
  if (cb.startsWith("okbuy:")) return doBuy(s, user.id, cb.slice(6));
  if (cb.startsWith("dep:")) return startDeposit(s, user.id, Number(cb.slice(4)));
  if (cb === "dep_other") {
    s.state = "DEP_CUSTOM";
    const min = asInt(await getSetting("min_deposit_cents", 500));
    const max = asInt(await getSetting("max_deposit_cents", 100000));
    return reply([{ text: t("deposit_enter", s.language, { min: formatMoney(min), max: formatMoney(max) }) }], {
      keyboard: navKb(s.language),
    });
  }
  if (cb.startsWith("pcopy:")) {
    const db = await getSql();
    const pay = await one<{ requisites_snapshot: unknown }>(db, `select requisites_snapshot from payments where id=$1`, [
      cb.slice(6),
    ]);
    const snap = asJson(pay?.requisites_snapshot, {} as Record<string, Json>);
    return reply([{ text: String(snap.details ?? t("pay_no_methods", s.language)) }], { keyboard: navKb(s.language) });
  }
  if (cb.startsWith("job:")) return showJob(s, cb.slice(4));
  if (cb.startsWith("paid:")) {
    s.state = "DEP_SHOT";
    s.payload = { ...s.payload, paymentId: cb.slice(5) };
    return reply([{ text: t("pay_need_shot", s.language) }], { keyboard: navKb(s.language), requestPhoto: true });
  }
  if (cb.startsWith("pcancel:")) {
    await cancelPayment({ paymentId: cb.slice(8), userId: user.id });
    s.state = "MAIN";
    return reply([{ text: t("pay_cancelled", s.language) }], { keyboard: mainKb(s.language) });
  }
  if (cb.startsWith("apply:")) {
    const res = await applyJob({ userId: user.id, jobId: cb.slice(6) });
    return reply([{ text: res.ok ? t("job_applied", s.language) : t("unknown", s.language) }], { keyboard: mainKb(s.language) });
  }
  if (cb.startsWith("revstar:")) {
    const [orderId, rating] = cb.slice(8).split(":");
    s.state = "REVIEW_TEXT";
    s.payload = { orderId, rating: Number(rating) };
    const db = await getSql();
    const ord = await one<{ public_code: string }>(db, `select public_code from orders where id=$1`, [orderId]);
    return reply([{ text: t("review_prompt", s.language, { code: ord?.public_code ?? orderId }) }], { keyboard: navKb(s.language) });
  }

  if (isCmd(text, s.language, "btn_catalog")) return showCatalog(s);
  if (isCmd(text, s.language, "btn_deposit")) return depositMenu(s);
  if (isCmd(text, s.language, "btn_jobs")) return jobsMenu(s);
  if (isCmd(text, s.language, "btn_reviews")) return reviewsMenu(s, user.id);
  if (isCmd(text, s.language, "btn_rules")) return pageMenu(s, "rules");
  if (isCmd(text, s.language, "btn_info")) return pageMenu(s, "info");
  if (isCmd(text, s.language, "btn_orders")) return ordersMenu(s, user.id);
  if (isCmd(text, s.language, "btn_kyc")) return kycStart(s, user.id);
  if (s.state.startsWith("KYC_")) return kycStep(s, user.id, input);
  if (isCmd(text, s.language, "btn_help")) {
    s.state = "SUPPORT";
    return reply([{ text: t("support_prompt", s.language) }], { keyboard: navKb(s.language) });
  }
  if (isCmd(text, s.language, "btn_exchange")) return exchangeMenu(s);
  if (isCmd(text, s.language, "btn_connect_bot")) {
    s.state = "CONNECT_BOT";
    return reply([{ text: t("connect_bot_prompt", s.language) }], { keyboard: navKb(s.language) });
  }

  if (s.state === "DEP_CUSTOM" && text) {
    const cents = parseMoneyToCents(text);
    if (!cents) return reply([{ text: t("deposit_enter", s.language, { min: "$5", max: "$1000" }) }], { keyboard: navKb(s.language) });
    return startDeposit(s, user.id, cents);
  }
  if (s.state === "DEP_SHOT") {
    if (input.photoDataUrl || input.telegramFileId) {
      const payId = String(s.payload.paymentId ?? "");
      const res = await attachPaymentScreenshot({
        paymentId: payId,
        userId: user.id,
        dataUrl: input.photoDataUrl,
        telegramFileId: input.telegramFileId,
      });
      s.state = "MAIN";
      return reply([{ text: res.ok ? t("screenshot_ok", s.language) : t("unknown", s.language) }], {
        keyboard: mainKb(s.language),
      });
    }
    return reply([{ text: t("deposit_created", s.language, { amount: "", code: String(s.payload.code ?? "") }) }], {
      requestPhoto: true,
      keyboard: navKb(s.language),
    });
  }
  if (s.state === "SUPPORT" && text) {
    const ticket = await openTicket({ userId: user.id, body: text });
    s.state = "MAIN";
    return reply([{ text: t("support_sent", s.language, { code: ticket.public_code }) }], { keyboard: mainKb(s.language) });
  }
  if (s.state === "REVIEW_TEXT" && text) {
    const res = await addReview({
      userId: user.id,
      orderId: String(s.payload.orderId),
      rating: asInt(s.payload.rating, 5),
      body: text,
    });
    s.state = "MAIN";
    return reply([{ text: res.ok ? t("review_thanks", s.language) : t("unknown", s.language) }], { keyboard: mainKb(s.language) });
  }
  if (s.state === "CONNECT_BOT" && text) {
    const token = text.trim();
    const username = token.length > 20 ? `bot_${token.slice(-6)}` : "unknown";
    const db = await getSql();
    const fp = token.slice(0, 6) + "…" + token.slice(-4);
    await db.query(
      `insert into personal_bots (id, user_id, username, token_fingerprint, status, last_check_at)
       values ($1,$2,$3,$4,'CONNECTED', now())`,
      [nid("pbt"), user.id, username, fp],
    );
    s.state = "MAIN";
    return reply([{ text: t("connect_bot_ok", s.language, { username }) }], { keyboard: mainKb(s.language) });
  }

  s.state = "MAIN";
  return reply([{ text: t("unknown", s.language) }], { keyboard: mainKb(s.language) });
}

async function showCatalog(s: Session): Promise<BotReply> {
  const cats = await listCategories();
  const buttons: InlineButton[][] = cats.map((c) => [
    { text: pickI18n(asJson(c.name_i18n, {}), s.language), data: `cat:${c.id}` },
  ]);
  buttons.push([{ text: t("cat_new", s.language), data: "cat:new" }]);
  buttons.push([{ text: t("cat_popular", s.language), data: "cat:popular" }]);
  buttons.push([{ text: t("cat_sale", s.language), data: "cat:sale" }]);
  s.state = "CATALOG";
  return reply([{ text: t("catalog_title", s.language), inline: inline(buttons) }], { keyboard: navKb(s.language) });
}

async function showCategory(s: Session, _userId: string, key: string): Promise<BotReply> {
  const special = key === "new" || key === "popular" || key === "sale" ? key : null;
  const products = await listPublishedProducts({
    categoryId: special ? null : key,
    special,
    lang: s.language,
  });
  if (!products.length) {
    return reply([{ text: t("catalog_empty", s.language) }], { keyboard: navKb(s.language) });
  }
  const buttons: InlineButton[][] = products.slice(0, 20).map((p) => [
    {
      text: `${productTitle(p, s.language)} · ${formatMoney(asInt(p.price_cents))}`,
      data: `prd:${p.id}`,
    },
  ]);
  return reply([{ text: t("catalog_title", s.language), inline: buttons }], { keyboard: navKb(s.language) });
}

async function showProduct(s: Session, userId: string, productId: string): Promise<BotReply> {
  const product = await getProduct(productId);
  if (!product) return reply([{ text: t("product_gone", s.language) }], { keyboard: navKb(s.language) });
  const quote = await quotePrice(productId, userId);
  const lang = s.language;
  const name = productTitle(product, lang);
  const desc = pickI18n(asJson(product.description_i18n, {}), lang);
  const rating =
    asInt(product.rating_count) > 0
      ? (asInt(product.rating_sum) / asInt(product.rating_count)).toFixed(1)
      : "—";
  const price = quote.ok ? formatMoney(quote.unitCents) : formatMoney(asInt(product.price_cents));
  const stock = asInt(product.stock) > 0 ? t("in_stock", lang, { n: asInt(product.stock) }) : t("out_of_stock", lang);
  const img = (product.images as Array<{ url: string; is_primary: boolean }>)?.[0]?.url;
  s.state = "PRODUCT";
  s.payload = { productId };
  return reply(
    [
      {
        text: `${name}\n\n${desc}\n\n${t("price", lang, { price })}\n${stock}\n${t("rating", lang, { rating, count: asInt(product.rating_count) })}`,
        photoUrl: img,
        inline: [
          [
            { text: t("btn_buy", lang), data: `buy:${productId}` },
            { text: t("btn_reviews", lang), data: `prd:${productId}` },
          ],
        ],
      },
    ],
    { keyboard: navKb(lang) },
  );
}

async function confirmBuy(s: Session, userId: string, productId: string): Promise<BotReply> {
  const quote = await quotePrice(productId, userId);
  if (!quote.ok && quote.error === "INSUFFICIENT") {
    /* handled below */
  }
  if (!quote.ok) {
    if (quote.error === "BLOCKED") return reply([{ text: t("blocked", s.language) }]);
    return reply([{ text: t("product_gone", s.language) }], { keyboard: navKb(s.language) });
  }
  if (quote.need > 0) {
    return reply(
      [
        {
          text: t("insufficient", s.language, {
            price: formatMoney(quote.unitCents),
            balance: formatMoney(quote.balance),
            need: formatMoney(quote.need),
          }),
          inline: [[{ text: t("btn_topup", s.language), data: "dep:0" }]],
        },
      ],
      { keyboard: navKb(s.language) },
    );
  }
  return reply(
    [
      {
        text: t("confirm_purchase", s.language, {
          name: quote.name,
          price: formatMoney(quote.unitCents),
          after: formatMoney(quote.balance - quote.unitCents),
        }),
        inline: [
          [
            { text: t("btn_confirm", s.language), data: `okbuy:${productId}` },
            { text: t("btn_cancel", s.language), data: `prd:${productId}` },
          ],
        ],
      },
    ],
    { keyboard: navKb(s.language) },
  );
}

async function doBuy(s: Session, userId: string, productId: string): Promise<BotReply> {
  const res = await purchaseProduct({ userId, productId });
  if (!res.ok) {
    if (res.error === "INSUFFICIENT" && res.quote && res.quote.ok) {
      return confirmBuy(s, userId, productId);
    }
    return reply([{ text: t("product_gone", s.language) }], { keyboard: mainKb(s.language) });
  }
  s.state = "MAIN";
  return reply(
    [
      {
        text: t("purchase_ok", s.language, {
          code: res.code,
          price: formatMoney(res.total),
          balance: formatMoney(res.balance),
        }),
      },
    ],
    { keyboard: mainKb(s.language) },
  );
}

async function depositMenu(s: Session): Promise<BotReply> {
  const rows: InlineButton[][] = DEPOSIT_PRESETS_CENTS.map((c) => [
    { text: formatMoney(c), data: `dep:${c}` },
  ]);
  rows.push([{ text: t("deposit_other", s.language), data: "dep_other" }]);
  s.state = "DEP";
  return reply([{ text: t("deposit_pick", s.language), inline: rows }], { keyboard: navKb(s.language) });
}

async function startDeposit(s: Session, userId: string, amount: number): Promise<BotReply> {
  if (!amount) return depositMenu(s);
  const created = await createPaymentRequest({
    userId,
    amountCents: amount,
    idempotencyKey: `dep:${userId}:${amount}:${Math.floor(Date.now() / 30000)}`,
  });
  s.state = "DEP_SHOT";
  s.payload = { paymentId: created.id, code: created.publicCode };
  const diff =
    created.payAmountCents !== created.amountCents
      ? t("deposit_diff", s.language, { delta: formatMoney(created.payAmountCents - created.amountCents) })
      : "";
  const method = created.method;
  return reply(
    [
      {
        text: t("deposit_created", s.language, {
          amount: formatMoney(created.amountCents),
          pay: formatMoney(created.payAmountCents),
          code: created.publicCode,
          diff,
          method: method?.title ?? "—",
          requisites: method?.details ?? t("pay_no_methods", s.language),
          comment: method?.comment ?? "",
        }),
        inline: [
          [
            { text: t("pay_btn_copy", s.language), data: `pcopy:${created.id}` },
            { text: t("pay_btn_paid", s.language), data: `paid:${created.id}` },
            { text: t("pay_btn_cancel", s.language), data: `pcancel:${created.id}` },
          ],
        ],
      },
    ],
    { keyboard: navKb(s.language), requestPhoto: true },
  );
}

async function ordersMenu(s: Session, userId: string): Promise<BotReply> {
  const db = await getSql();
  const orders = await many<{ id: string; public_code: string; status: string; total_cents: number }>(
    db,
    `select id, public_code, status, total_cents from orders where user_id=$1 order by created_at desc limit 10`,
    [userId],
  );
  if (!orders.length) return reply([{ text: t("no_orders", s.language) }], { keyboard: navKb(s.language) });
  const lines = orders.map((o) =>
    t("order_line", s.language, { code: o.public_code, status: o.status, total: formatMoney(asInt(o.total_cents)) }),
  );
  const reviewable = orders.filter((o) => o.status === "DELIVERED" || o.status === "COMPLETED");
  const inlineBtns: InlineButton[][] = reviewable.map((o) => [
    { text: `★ ${o.public_code}`, data: `revstar:${o.id}:5` },
  ]);
  return reply([{ text: lines.join("\n"), inline: inlineBtns.length ? inlineBtns : undefined }], {
    keyboard: navKb(s.language),
  });
}

async function reviewsMenu(s: Session, _userId: string): Promise<BotReply> {
  const db = await getSql();
  const rows = await many<{ rating: number; body: string | null; first_name: string | null }>(
    db,
    `select r.rating, r.body, u.first_name
     from reviews r join shop_users u on u.id=r.user_id
     where r.status='VISIBLE' order by r.created_at desc limit 10`,
  );
  if (!rows.length) return reply([{ text: t("reviews_empty", s.language) }], { keyboard: navKb(s.language) });
  const avgRow = await one<{ avg: number; n: number }>(
    db,
    `select coalesce(avg(rating),0)::float as avg, count(*)::int as n from reviews where status='VISIBLE'`,
  );
  const text =
    `★ ${Number(avgRow?.avg ?? 0).toFixed(1)} (${asInt(avgRow?.n)})\n\n` +
    rows.map((r) => `★${r.rating} ${r.first_name ?? "client"}: ${r.body ?? ""}`).join("\n");
  return reply([{ text }], { keyboard: navKb(s.language) });
}

async function pageMenu(s: Session, slug: string): Promise<BotReply> {
  const db = await getSql();
  const page = await one<{ title_i18n: unknown; body_i18n: unknown }>(db, `select title_i18n, body_i18n from pages where slug=$1`, [
    slug,
  ]);
  const title = pickI18n(asJson(page?.title_i18n, {}), s.language);
  const body = pickI18n(asJson(page?.body_i18n, {}), s.language);
  return reply([{ text: `${title}\n\n${body}` }], { keyboard: navKb(s.language) });
}

async function jobsMenu(s: Session): Promise<BotReply> {
  const db = await getSql();
  const jobs = await many(db, `select * from jobs where status='ACTIVE' order by created_at desc`);
  if (!jobs.length) return reply([{ text: t("jobs_empty", s.language) }], { keyboard: navKb(s.language) });
  const buttons: InlineButton[][] = jobs.map((j) => [
    { text: pickI18n(asJson(j.title_i18n, {}), s.language), data: `job:${j.id}` },
  ]);
  return reply([{ text: t("btn_jobs", s.language), inline: buttons }], { keyboard: navKb(s.language) });
}

async function showJob(s: Session, jobId: string): Promise<BotReply> {
  const db = await getSql();
  const job = await one(db, `select * from jobs where id=$1`, [jobId]);
  if (!job) return reply([{ text: t("jobs_empty", s.language) }]);
  const title = pickI18n(asJson(job.title_i18n, {}), s.language);
  const body = pickI18n(asJson(job.description_i18n, {}), s.language);
  return reply(
    [
      {
        text: `${title}\n\n${body}\n\n${job.payment_text ?? ""}\n${job.location ?? ""} · ${job.schedule ?? ""}`,
        inline: [[{ text: t("job_apply", s.language), data: `apply:${jobId}` }]],
      },
    ],
    { keyboard: navKb(s.language) },
  );
}

async function exchangeMenu(s: Session): Promise<BotReply> {
  const db = await getSql();
  const rates = await many<{ code: string; rate_to_usd: string | number }>(
    db,
    `select code, rate_to_usd from exchange_rates order by code`,
  );
  const lines = rates.map((r) => `${r.code}: ${r.rate_to_usd}`);
  return reply([{ text: `${t("exchange_title", s.language)}\n\n${lines.join("\n")}` }], { keyboard: navKb(s.language) });
}

async function handlePaymentBot(s: Session, input: BotIncoming): Promise<BotReply> {
  const user = await upsertShopUser({
    telegramId: input.telegramId,
    username: input.username,
    firstName: input.firstName,
    language: s.language,
  });
  s.user_id = user.id;
  const text = (input.text ?? "").trim();
  const cb = input.callbackData ?? "";
  const lang = s.language;
  const menu = reply([{ text: t("pay_menu", lang) }], {
    keyboard: [[{ text: t("pay_btn_topup", lang) }], [{ text: t("pay_btn_list", lang) }], [{ text: t("pay_btn_profile", lang) }]],
  });

  if (text === "/start" || s.state === "BOOT") {
    s.state = "PAY";
    return menu;
  }
  if (cb.startsWith("pcopy:")) {
    const db = await getSql();
    const pay = await one<{ requisites_snapshot: unknown }>(db, `select requisites_snapshot from payments where id=$1`, [
      cb.slice(6),
    ]);
    const snap = asJson(pay?.requisites_snapshot, {} as Record<string, Json>);
    return reply([{ text: String(snap.details ?? t("pay_no_methods", lang)) }], { keyboard: navKb(lang) });
  }
  if (cb.startsWith("paid:")) {
    s.state = "PAY_SHOT";
    s.payload = { ...s.payload, paymentId: cb.slice(5) };
    return reply([{ text: t("pay_need_shot", lang) }], { requestPhoto: true, keyboard: navKb(lang) });
  }
  if (cb.startsWith("pcancel:")) {
    await cancelPayment({ paymentId: cb.slice(8), userId: user.id });
    s.state = "PAY";
    return reply([{ text: t("pay_cancelled", lang) }], {
      keyboard: [[{ text: t("pay_btn_topup", lang) }], [{ text: t("pay_btn_list", lang) }]],
    });
  }
  if (isCmd(text, lang, "pay_btn_topup")) {
    s.state = "PAY_AMOUNT";
    return reply([{ text: t("pay_enter_amount", lang) }], { keyboard: navKb(lang) });
  }
  if (isCmd(text, lang, "pay_btn_list")) {
    const db = await getSql();
    const rows = await many<{ public_code: string; status: string; amount_cents: number; pay_amount_cents: number | null }>(
      db,
      `select public_code, status, amount_cents, pay_amount_cents from payments where user_id=$1 order by created_at desc limit 10`,
      [user.id],
    );
    if (!rows.length) return reply([{ text: "—" }], { keyboard: [[{ text: t("pay_btn_topup", lang) }]] });
    const lines = rows.map((r) => `${r.public_code} · ${r.status} · ${formatMoney(asInt(r.amount_cents))}`);
    return reply([{ text: lines.join("\n") }], { keyboard: [[{ text: t("pay_btn_topup", lang) }]] });
  }
  if (isCmd(text, lang, "pay_btn_profile")) {
    return reply(
      [{ text: `ID: ${user.public_code ?? user.id}\nTelegram: ${user.telegram_id}\n@${user.username ?? "—"}\n${formatMoney(asInt(user.balance_cents))}` }],
      { keyboard: [[{ text: t("pay_btn_topup", lang) }]] },
    );
  }
  if (s.state === "PAY_AMOUNT" && text) {
    const centsVal = parseMoneyToCents(text);
    if (!centsVal) return reply([{ text: t("pay_enter_amount", lang) }], { keyboard: navKb(lang) });
    return startDeposit(s, user.id, centsVal);
  }
  const code = text.match(/PAY-\d{8}-\d+/i)?.[0]?.toUpperCase();
  if (code) s.payload = { ...s.payload, code };
  if (input.photoDataUrl || input.telegramFileId) {
    const res = await attachPaymentScreenshot({
      paymentId: s.payload.paymentId ? String(s.payload.paymentId) : undefined,
      publicCode: String(s.payload.code ?? code ?? ""),
      userId: user.id,
      dataUrl: input.photoDataUrl,
      telegramFileId: input.telegramFileId,
    });
    s.state = "PAY";
    return reply([{ text: res.ok ? t("screenshot_ok", lang) : t("unknown", lang) }], {
      keyboard: [[{ text: t("pay_btn_topup", lang) }], [{ text: t("pay_btn_list", lang) }]],
    });
  }
  return menu;
}

async function kycStart(s: Session, userId: string): Promise<BotReply> {
  const draft = await getOrCreateKycDraft(userId);
  s.state = "KYC_FN";
  s.payload = { ...s.payload, kycId: draft.id };
  return reply([{ text: t("kyc_intro", s.language) }], { keyboard: navKb(s.language) });
}

async function kycStep(s: Session, userId: string, input: BotIncoming): Promise<BotReply> {
  const kycId = String(s.payload.kycId ?? "");
  const text = (input.text ?? "").trim();
  const lang = s.language;
  if (!kycId) return kycStart(s, userId);
  if (s.state === "KYC_FN" && text) {
    await patchKyc(kycId, userId, { first_name: text });
    s.state = "KYC_LN";
    return reply([{ text: t("kyc_last", lang) }], { keyboard: navKb(lang) });
  }
  if (s.state === "KYC_LN" && text) {
    await patchKyc(kycId, userId, { last_name: text });
    s.state = "KYC_PAT";
    return reply([{ text: t("kyc_pat", lang) }], { keyboard: navKb(lang) });
  }
  if (s.state === "KYC_PAT" && text) {
    await patchKyc(kycId, userId, { patronymic: text.toLowerCase() === "нет" || text.toLowerCase() === "none" ? "" : text });
    s.state = "KYC_DOB";
    return reply([{ text: t("kyc_dob", lang) }], { keyboard: navKb(lang) });
  }
  if (s.state === "KYC_DOB" && text) {
    await patchKyc(kycId, userId, { birth_date: text });
    s.state = "KYC_DOC";
    return reply([{ text: t("kyc_doc", lang) }], { keyboard: navKb(lang), requestPhoto: true });
  }
  if (s.state === "KYC_DOC" && (input.photoDataUrl || input.telegramFileId)) {
    await patchKyc(kycId, userId, { document_url: input.photoDataUrl, document_file_id: input.telegramFileId });
    s.state = "KYC_VIDEO";
    return reply([{ text: t("kyc_video", lang) }], { keyboard: navKb(lang) });
  }
  if (s.state === "KYC_VIDEO" && (input.telegramFileId || input.photoDataUrl || text)) {
    await patchKyc(kycId, userId, { video_url: input.photoDataUrl ?? text, video_file_id: input.telegramFileId });
    const res = await submitKyc(kycId, userId);
    s.state = "MAIN";
    return reply([{ text: res.ok ? t("kyc_sent", lang, { code: res.publicCode }) : t("kyc_incomplete", lang) }], {
      keyboard: mainKb(lang),
    });
  }
  return reply([{ text: t("unknown", lang) }], { keyboard: navKb(lang) });
}

function courierKb(lang: Lang): KeyboardButton[][] {
  return [
    [{ text: t("courier_online", lang) }, { text: t("courier_offline", lang) }],
    [{ text: t("courier_tasks", lang) }],
    [{ text: t("courier_loc", lang), requestLocation: true }],
    [{ text: t("courier_photo", lang) }],
    [{ text: t("courier_done", lang) }],
    [{ text: t("courier_profile", lang) }],
  ];
}

async function handleCourierBot(s: Session, input: BotIncoming): Promise<BotReply> {
  const shopUser = await upsertShopUser({
    telegramId: input.telegramId,
    username: input.username,
    firstName: input.firstName,
    language: s.language,
  });
  const courier = await upsertCourier({
    telegramId: input.telegramId,
    username: input.username,
    firstName: input.firstName,
    userId: shopUser.id,
  });
  s.user_id = shopUser.id;
  s.courier_id = String(courier.id);
  const lang = s.language;
  const text = (input.text ?? "").trim();
  const cb = input.callbackData ?? "";

  if (text === "/start" || s.state === "BOOT") {
    s.state = "C_MAIN";
    return reply([{ text: `${t("courier_welcome", lang)}\nStatus: ${courier.status} / ${courier.availability}` }], {
      keyboard: courierKb(lang),
    });
  }
  if (cb.startsWith("cacc:")) {
    await respondTask({ taskId: cb.slice(5), courierId: String(courier.id), accept: true });
    s.payload = { ...s.payload, taskId: cb.slice(5) };
    return reply([{ text: t("courier_accepted", lang) }], { keyboard: courierKb(lang) });
  }
  if (cb.startsWith("crej:")) {
    await respondTask({ taskId: cb.slice(5), courierId: String(courier.id), accept: false });
    return reply([{ text: t("courier_declined", lang) }], { keyboard: courierKb(lang) });
  }
  if (isCmd(text, lang, "courier_online")) {
    const res = await setCourierAvailability(String(courier.id), "ONLINE");
    return reply([{ text: res.ok ? "ONLINE" : t("courier_welcome", lang) }], { keyboard: courierKb(lang) });
  }
  if (isCmd(text, lang, "courier_offline")) {
    await setCourierAvailability(String(courier.id), "OFFLINE");
    return reply([{ text: "OFFLINE" }], { keyboard: courierKb(lang) });
  }
  if (isCmd(text, lang, "courier_tasks")) {
    const db = await getSql();
    const tasks = await many<{ id: string; public_code: string; product_summary: string; quantity: number; notes: string | null; status: string; order_id: string | null }>(
      db,
      `select * from courier_tasks where courier_id=$1 and status in ('ASSIGNED','ACCEPTED','IN_PROGRESS','PENDING_REVIEW') order by created_at desc`,
      [courier.id],
    );
    if (!tasks.length) return reply([{ text: "—" }], { keyboard: courierKb(lang) });
    const msgs = tasks.map((task) => ({
      text: t("courier_new_task", lang, {
        order: task.public_code,
        product: task.product_summary ?? "—",
        qty: task.quantity,
        notes: task.notes ?? "",
      }) + `\n${task.status}`,
      inline:
        task.status === "ASSIGNED"
          ? [
              [
                { text: t("courier_accept", lang), data: `cacc:${task.id}` },
                { text: t("courier_decline", lang), data: `crej:${task.id}` },
              ],
            ]
          : undefined,
    }));
    s.payload = { ...s.payload, taskId: tasks[0]?.id };
    return reply(msgs, { keyboard: courierKb(lang) });
  }
  if (input.location) {
    await saveLocation({
      courierId: String(courier.id),
      lat: input.location.lat,
      lng: input.location.lng,
      taskId: s.payload.taskId ? String(s.payload.taskId) : null,
    });
    s.payload = { ...s.payload, lat: input.location.lat, lng: input.location.lng };
    return reply([{ text: t("loc_saved", lang) }], { keyboard: courierKb(lang) });
  }
  if (isCmd(text, lang, "courier_loc")) {
    return reply([{ text: t("courier_loc", lang) }], { keyboard: courierKb(lang), requestLocation: true });
  }
  if (input.photoDataUrl && s.payload.taskId) {
    await addReportPhoto({
      courierId: String(courier.id),
      taskId: String(s.payload.taskId),
      dataUrl: input.photoDataUrl,
    });
    return reply([{ text: t("photo_saved", lang) }], { keyboard: courierKb(lang) });
  }
  if (isCmd(text, lang, "courier_photo")) {
    s.state = "C_PHOTO";
    return reply([{ text: t("courier_photo", lang) }], { keyboard: courierKb(lang), requestPhoto: true });
  }
  if (isCmd(text, lang, "courier_done")) {
    s.state = "C_DONE";
    return reply([{ text: t("report_need", lang) }], { keyboard: courierKb(lang), requestPhoto: true, requestLocation: true });
  }
  if (s.state === "C_DONE" && text && s.payload.taskId) {
    const res = await submitReport({
      courierId: String(courier.id),
      taskId: String(s.payload.taskId),
      comment: text,
      lat: typeof s.payload.lat === "number" ? s.payload.lat : null,
      lng: typeof s.payload.lng === "number" ? s.payload.lng : null,
    });
    s.state = "C_MAIN";
    return reply([{ text: res.ok ? t("report_sent", lang) : t("unknown", lang) }], { keyboard: courierKb(lang) });
  }
  if (isCmd(text, lang, "courier_profile")) {
    return reply(
      [
        {
          text: `${courier.first_name ?? ""}\n${courier.status} / ${courier.availability}\nDone: ${courier.completed_count}\nRejected: ${courier.rejected_count}`,
        },
      ],
      { keyboard: courierKb(lang) },
    );
  }
  return reply([{ text: t("unknown", lang) }], { keyboard: courierKb(lang) });
}

export async function history(bot: BotKind, telegramId: number) {
  const db = await getSql();
  return many(
    db,
    `select id, direction, text, payload, created_at from bot_messages
     where bot=$1 and telegram_id=$2 order by created_at asc limit 80`,
    [bot, telegramId],
  );
}
