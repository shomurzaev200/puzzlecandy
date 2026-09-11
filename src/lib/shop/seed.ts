import { ROLE_SEED } from "./rbac";
import { nid } from "./ids";
import { sql as getClient, one } from "./db";
import type { Sql } from "./db";

const g = globalThis as typeof globalThis & { __puzzlcandySeeded__?: Promise<void> };

function candySvg(title: string, accent: string): string {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 500'>
    <defs>
      <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0%' stop-color='#08110D'/>
        <stop offset='100%' stop-color='#0C1713'/>
      </linearGradient>
    </defs>
    <rect width='800' height='500' fill='url(#g)'/>
    <circle cx='640' cy='90' r='120' fill='${accent}' opacity='0.18'/>
    <circle cx='120' cy='420' r='90' fill='#00E5FF' opacity='0.12'/>
    <rect x='80' y='70' width='640' height='360' rx='28' fill='#050807' stroke='${accent}' stroke-width='2'/>
    <text x='400' y='250' text-anchor='middle' font-family='Sora,Segoe UI,sans-serif' font-size='42' fill='${accent}'>${title}</text>
    <text x='400' y='300' text-anchor='middle' font-family='IBM Plex Mono,monospace' font-size='16' fill='#7A9A88'>PUZZLECANDY · ПРЕМИАЛЬНЫЕ ТОВАРЫ</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function ensureSeed(): Promise<void> {
  g.__puzzlcandySeeded__ ??= (async () => {
    const db = await getClient();
    await seedAll(db);
    const gp = globalThis as typeof globalThis & { __pcBotPollTimer?: boolean };
    if (!gp.__pcBotPollTimer) {
      gp.__pcBotPollTimer = true;
      setTimeout(() => {
        void import("./telegram-poll")
          .then((m) => m.startBotPolling())
          .catch((err: unknown) => console.error("[telegram] poller schedule failed:", err));
      }, 3000);
    }
  })().catch((err) => {
    g.__puzzlcandySeeded__ = undefined;
    throw err;
  });
  return g.__puzzlcandySeeded__;
}

async function seedAll(db: Sql): Promise<void> {
  for (const row of ROLE_SEED) {
    await db.query(
      `insert into role_permissions (role, permission) values ($1,$2) on conflict do nothing`,
      [row.role, row.permission],
    );
  }

  const settings: Array<[string, unknown]> = [
    ["shop_name", { ru: "PUZZLECANDY", uz: "PUZZLECANDY", en: "PUZZLECANDY" }],
    ["currency", "USD"],
    ["min_deposit_cents", 500],
    ["max_deposit_cents", 100000],
    ["referral_percent", 5],
    ["maintenance", false],
    ["welcome_override", {}],
    ["contacts", { operator: "@puzzlcandy_support", channel: "@puzzlcandy_news", hours: "10:00–22:00" }],
    ["secrets", { main_bot_token: "", payment_bot_token: "", courier_bot_token: "" }],
  ];
  for (const [key, value] of settings) {
    await db.query(
      `insert into shop_settings (key, value_json) values ($1,$2::jsonb) on conflict (key) do nothing`,
      [key, JSON.stringify(value)],
    );
  }

  await db.query(
    `insert into exchange_rates (code, rate_to_usd) values
      ('USD', 1), ('EUR', 0.92), ('UZS', 12750)
     on conflict (code) do nothing`,
  );

  await db.query(
    `insert into shop_settings (key, value_json) values ('shop_name', $1::jsonb)
     on conflict (key) do update set value_json=excluded.value_json`,
    [JSON.stringify({ ru: "PUZZLECANDY", uz: "PUZZLECANDY", en: "PUZZLECANDY" })],
  );
  await db.query(
    `insert into shop_settings (key, value_json) values ('contacts', $1::jsonb)
     on conflict (key) do update set value_json=excluded.value_json`,
    [JSON.stringify({ operator: "@puzzlcandy_support", channel: "@puzzlcandy_news", hours: "10:00–22:00" })],
  );

  await db.query(
    `insert into bot_accounts (id, kind, username, status, title) values
      ($1,'main','PuzzleCandyShop','ONLINE','PUZZLECANDY'),
      ($2,'payment','PuzzleCandyPay','ONLINE','PUZZLECANDY — платежи'),
      ($3,'courier','PuzzleCandyCourier','ONLINE','PUZZLECANDY — курьеры')
     on conflict do nothing`,
    [nid("bot"), nid("bot"), nid("bot")],
  );
  await db.query(`update bot_accounts set username='PuzzleCandyShop', title='PUZZLECANDY' where kind='main'`);
  await db.query(`update bot_accounts set username='PuzzleCandyPay', title='PUZZLECANDY — платежи' where kind='payment'`);
  await db.query(`update bot_accounts set username='PuzzleCandyCourier', title='PUZZLECANDY — курьеры' where kind='courier'`);

  await db.query(
    `insert into payment_methods (id, title, kind, details, comment, status, sort_order)
     values ($1,'Uzcard','CARD','XXXX XXXX XXXX XXXX','Переведите точную сумму к оплате одним платежом.','ACTIVE',0)
     on conflict (id) do nothing`,
    ["pm_default_card"],
  ).catch(() => undefined);

  const pages = [
    {
      slug: "rules",
      title: { ru: "Правила магазина", uz: "Do'kon qoidalari", en: "Shop rules" },
      body: {
        ru: "1. Только легальные товары и услуги.\n2. Пополнение баланса проверяется администратором вручную.\n3. Баланс зачисляется только после подтверждения платежа.\n4. Заказы нельзя отменить после передачи курьеру без согласования.\n5. Запрещены мошенничество, мультиаккаунты и попытки обойти модерацию.\n6. Администратор может заблокировать аккаунт при нарушении правил.",
        uz: "1. Faqat qonuniy mahsulotlar.\n2. Balans administrator tomonidan tasdiqlanadi.\n3. Qoidalarni buzish hisobni bloklashga olib keladi.",
        en: "1. Legal goods and services only.\n2. Balance top-ups are reviewed by an administrator.\n3. Funds credit only after approval.\n4. Fraud, multi-accounting and moderation evasion are prohibited.",
      },
    },
    {
      slug: "info",
      title: { ru: "Информация", uz: "Ma'lumot", en: "Info" },
      body: {
        ru: "PUZZLECANDY — премиальный магазин легальных кондитерских изделий и подарочных наборов.\nОператор: через кнопку Помощь.\nВремя работы: 10:00–22:00.",
        uz: "PUZZLECANDY — qonuniy premium confectionery do'koni.",
        en: "PUZZLECANDY is a premium shop for legal confectionery and gift sets.\nSupport via the Help button.\nHours: 10:00–22:00.",
      },
    },
    {
      slug: "faq",
      title: { ru: "FAQ", uz: "FAQ", en: "FAQ" },
      body: {
        ru: "Как пополнить? Кнопка Пополнение → сумма → скриншот → ожидание проверки.\nКак купить? Витрина → товар → Купить. Списание только с подтверждённого баланса.",
        uz: "To'ldirish: summa → skrinshot → tasdiq.\nXarid: vitrina → mahsulot → sotib olish.",
        en: "Top up: choose amount → send screenshot → wait for approval.\nBuy: open showcase → product → Buy. Charges use confirmed balance only.",
      },
    },
  ];
  for (const p of pages) {
    await db.query(
      `insert into pages (id, slug, title_i18n, body_i18n) values ($1,$2,$3::jsonb,$4::jsonb)
       on conflict (slug) do nothing`,
      [nid("pg"), p.slug, JSON.stringify(p.title), JSON.stringify(p.body)],
    );
  }
  await db.query(
    `update pages set body_i18n = replace(body_i18n::text, 'DAZZLE', 'PUZZLECANDY')::jsonb
     where body_i18n::text like '%DAZZLE%'`,
  );

  const cats = [
    { slug: "signature", icon: "diamond", sort: 1, name: { ru: "Фирменная линейка", uz: "Imzo to'plami", en: "Signature line" } },
    { slug: "gifts", icon: "gift", sort: 2, name: { ru: "Подарочные наборы", uz: "Sovg'a to'plamlari", en: "Gift sets" } },
    { slug: "classic", icon: "box", sort: 3, name: { ru: "Классика", uz: "Klassika", en: "Classics" } },
  ];
  const catIds: Record<string, string> = {};
  for (const c of cats) {
    const existing = await one<{ id: string }>(db, `select id from categories where slug=$1`, [c.slug]);
    if (existing) {
      catIds[c.slug] = existing.id;
      continue;
    }
    const id = nid("cat");
    catIds[c.slug] = id;
    await db.query(
      `insert into categories (id, slug, name_i18n, icon, sort_order, status) values ($1,$2,$3::jsonb,$4,$5,'ACTIVE')`,
      [id, c.slug, JSON.stringify(c.name), c.icon, c.sort],
    );
  }

  type SeedProduct = {
    slug: string;
    cat: string;
    price: number;
    old?: number;
    stock: number;
    featured?: boolean;
    accent: string;
    name: Record<string, string>;
    short: Record<string, string>;
    desc: Record<string, string>;
  };
  const products: SeedProduct[] = [
    {
      slug: "neon-gummy-cube",
      cat: "signature",
      price: 1200,
      old: 1500,
      stock: 24,
      featured: true,
      accent: "#00FF66",
      name: { ru: "Neon Gummy Cube", uz: "Neon Gummy Cube", en: "Neon Gummy Cube" },
      short: { ru: "Кислые мармеладные кубы.", uz: "Nordon marmelad kubiklari.", en: "Sour gummy cubes." },
      desc: {
        ru: "Легальный мармелад премиум-класса. Яркий цитрус, без красителей спорного происхождения. Упаковка 200 г.",
        uz: "Premium marmelad, 200 g.",
        en: "Premium legal gummies. Bright citrus. 200 g tin.",
      },
    },
    {
      slug: "midnight-ganache",
      cat: "classic",
      price: 2200,
      stock: 16,
      featured: true,
      accent: "#00E5FF",
      name: { ru: "Midnight Ganache", uz: "Midnight Ganache", en: "Midnight Ganache" },
      short: { ru: "Горький шоколад 72%.", uz: "Achchiq shokolad 72%.", en: "72% dark ganache." },
      desc: {
        ru: "Шоколадные плитки с ганашем. Какао из прослеживаемых ферм. 120 г.",
        uz: "120 g shokolad.",
        en: "Traceable cacao ganache bars. 120 g.",
      },
    },
    {
      slug: "puzzle-sour-belt",
      cat: "signature",
      price: 900,
      stock: 40,
      accent: "#39FF88",
      name: { ru: "Puzzle Sour Belt", uz: "Puzzle Sour Belt", en: "Puzzle Sour Belt" },
      short: { ru: "Кислые ремешки.", uz: "Nordon tasma.", en: "Sour candy belts." },
      desc: {
        ru: "Классические кислые ремешки в матовой упаковке. 150 г.",
        uz: "150 g nordon tasma.",
        en: "Classic sour belts in matte pouch. 150 g.",
      },
    },
    {
      slug: "emerald-box",
      cat: "gifts",
      price: 4900,
      old: 5600,
      stock: 8,
      featured: true,
      accent: "#00FF66",
      name: { ru: "Emerald Gift Box", uz: "Emerald Gift Box", en: "Emerald Gift Box" },
      short: { ru: "Подарочный сет на 8 позиций.", uz: "8 ta mahsulotli sovg'a.", en: "8-piece gift set." },
      desc: {
        ru: "Коллекционный набор: шоколад, мармелад, карамель, открытка. Только 18+ брендинг отсутствует — семейный подарок.",
        uz: "8 mahsulotli to'plam.",
        en: "Collector set of chocolate, gummies and caramel. Family gift.",
      },
    },
    {
      slug: "yuzu-drops",
      cat: "classic",
      price: 1400,
      stock: 20,
      accent: "#00E5FF",
      name: { ru: "Yuzu Drops", uz: "Yuzu Drops", en: "Yuzu Drops" },
      short: { ru: "Юдзу-карамель.", uz: "Yuzu karamel.", en: "Yuzu caramel drops." },
      desc: {
        ru: "Твёрдая карамель с юдзу. 90 г стеклянная банка.",
        uz: "90 g yuzu karamel.",
        en: "Hard caramel with yuzu. 90 g glass jar.",
      },
    },
    {
      slug: "matcha-bark",
      cat: "signature",
      price: 1800,
      stock: 12,
      accent: "#39FF88",
      name: { ru: "Matcha Bark", uz: "Matcha Bark", en: "Matcha Bark" },
      short: { ru: "Белый шоколад и матча.", uz: "Oq shokolad va matcha.", en: "White chocolate matcha bark." },
      desc: {
        ru: "Белый шоколад с церемониальной матчей. 100 г.",
        uz: "100 g matcha shokolad.",
        en: "White chocolate with ceremonial matcha. 100 g.",
      },
    },
  ];

  for (const p of products) {
    const exists = await one<{ id: string }>(db, `select id from products where slug=$1`, [p.slug]);
    if (exists) continue;
    const id = nid("prd");
    const discount = p.old ? Math.round((1 - p.price / p.old) * 100) : 0;
    await db.query(
      `insert into products (
         id, slug, name_i18n, description_i18n, short_description_i18n, specs_i18n,
         price_cents, old_price_cents, discount_percent, category_id, stock,
         status, published, featured, sort_order, moderation_status
       ) values (
         $1,$2,$3::jsonb,$4::jsonb,$5::jsonb,$6::jsonb,
         $7,$8,$9,$10,$11,'ACTIVE', true, $12, 0, 'APPROVED'
       )`,
      [
        id,
        p.slug,
        JSON.stringify(p.name),
        JSON.stringify(p.desc),
        JSON.stringify(p.short),
        JSON.stringify({ ru: "Состав: сахар, патока, натуральные ароматизаторы. Хранить в сухом месте.", en: "Store in a dry place." }),
        p.price,
        p.old ?? null,
        discount,
        catIds[p.cat],
        p.stock,
        p.featured ?? false,
      ],
    );
    await db.query(
      `insert into product_images (id, product_id, url, alt, is_primary, sort_order)
       values ($1,$2,$3,$4,true,0)`,
      [nid("img"), id, candySvg(p.name.en, p.accent), p.name.en],
    );
  }

  const jobExists = await one<{ n: number }>(db, `select count(*)::int as n from jobs`);
  if (!jobExists || jobExists.n === 0) {
    await db.query(
      `insert into jobs (id, title_i18n, description_i18n, payment_text, requirements, location, schedule, status)
       values ($1,$2::jsonb,$3::jsonb,$4,$5,$6,$7,'ACTIVE')`,
      [
        nid("job"),
        JSON.stringify({ ru: "Курьер по городу", uz: "Shahar kuryeri", en: "City courier" }),
        JSON.stringify({
          ru: "Легальная доставка кондитерских заказов. Нужен смартфон и готовность выходить на смены.",
          en: "Legal confectionery delivery. Smartphone and shift availability required.",
        }),
        "$8–12 / task",
        "18+, smartphone, local ID",
        "Tashkent",
        "Flexible",
      ],
    );
  }
}
