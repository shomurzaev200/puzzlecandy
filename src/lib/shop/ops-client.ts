/** Client-safe ops helpers (blocks 76–135). No DB imports. */

export type Density = "compact" | "comfortable";
export type ThemePref = "dark" | "light" | "system";

export const DEFAULT_SOUND_EVENTS = [
  "PAYMENT_PENDING",
  "NEW_ORDER",
  "NEW_SUPPORT",
  "SYSTEM_ERROR",
  "COURIER_REPORT",
] as const;

export type SoundPrefs = {
  enabled: boolean;
  volume: number;
  events: string[];
};

export function loadSoundPrefs(): SoundPrefs {
  try {
    const enabled = localStorage.getItem("pc.sound") !== "off";
    const volume = Number(localStorage.getItem("pc.sound.volume") ?? "40");
    const raw = localStorage.getItem("pc.sound.events");
    const events = raw ? (JSON.parse(raw) as string[]) : [...DEFAULT_SOUND_EVENTS];
    return { enabled, volume: Number.isFinite(volume) ? Math.min(100, Math.max(0, volume)) : 40, events };
  } catch {
    return { enabled: true, volume: 40, events: [...DEFAULT_SOUND_EVENTS] };
  }
}

export function saveSoundPrefs(p: SoundPrefs) {
  try {
    localStorage.setItem("pc.sound", p.enabled ? "on" : "off");
    localStorage.setItem("pc.sound.volume", String(p.volume));
    localStorage.setItem("pc.sound.events", JSON.stringify(p.events));
  } catch {
    /* ignore */
  }
}

export function loadDensity(): Density {
  try {
    return localStorage.getItem("pc.density") === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

export function saveDensity(d: Density) {
  try {
    localStorage.setItem("pc.density", d);
  } catch {
    /* ignore */
  }
}

export function loadTheme(): ThemePref {
  try {
    const v = localStorage.getItem("pc.theme");
    if (v === "light" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "dark";
}

export function saveTheme(t: ThemePref) {
  try {
    localStorage.setItem("pc.theme", t);
  } catch {
    /* ignore */
  }
}

export function slaMinutes(since: unknown, now = Date.now()): number | null {
  if (!since) return null;
  const start = new Date(String(since)).getTime();
  if (!Number.isFinite(start)) return null;
  return Math.max(0, Math.floor((now - start) / 60000));
}

export function slaLevel(since: unknown, now = Date.now()): "ok" | "warn" | "crit" | null {
  const m = slaMinutes(since, now);
  if (m == null) return null;
  if (m < 5) return "ok";
  if (m < 15) return "warn";
  return "crit";
}

export type OmniKind = "user" | "order" | "payment" | "amount" | "tx" | "product" | "ticket" | "courier" | "raw";

export function parseOmniQuery(q: string): { kind: OmniKind; value: string; raw: string } {
  const raw = q.trim();
  if (!raw) return { kind: "raw", value: "", raw };
  if (raw.startsWith("@")) return { kind: "user", value: raw.slice(1).trim(), raw };
  if (/^tx:/i.test(raw)) return { kind: "tx", value: raw.replace(/^tx:/i, "").trim(), raw };
  if (raw.startsWith("$") || raw.startsWith("€")) return { kind: "amount", value: raw.replace(/^[^\d.]/, "").trim(), raw };
  if (/^(#)?(ORD|ORDER)[-_]?/i.test(raw) || raw.startsWith("#")) {
    return { kind: "order", value: raw.replace(/^#/, "").trim(), raw };
  }
  if (/^PAY[-_]/i.test(raw)) return { kind: "payment", value: raw, raw };
  if (/^TKT[-_]/i.test(raw)) return { kind: "ticket", value: raw, raw };
  return { kind: "raw", value: raw, raw };
}

export type CalcOk = { ok: true; result: string; detail: string };
export type CalcFail = { ok: false };

export function evalCommandCalc(input: string, uzsPerUsd = 12750): CalcOk | CalcFail {
  const s = input.trim().replace(/,/g, ".").replace(/\s+/g, " ");
  if (!s) return { ok: false };

  const conv = s.match(/^(\d+(?:\.\d+)?)\s*(usdt|usd|uzs|eur)?\s+in\s+(usdt|usd|uzs|eur)$/i);
  if (conv) {
    const amount = Number(conv[1]);
    const from = (conv[2] || "usd").toLowerCase();
    const to = conv[3].toLowerCase();
    const usd = toUsd(amount, from, uzsPerUsd);
    const out = fromUsd(usd, to, uzsPerUsd);
    return {
      ok: true,
      result: formatNum(out, to),
      detail: `${formatNum(amount, from)} → ${formatNum(out, to)} (курс ${uzsPerUsd} UZS/USD)`,
    };
  }

  const pctOff = s.match(/^(\d+(?:\.\d+)?)\s*(usd|usdt)?\s*-\s*(\d+(?:\.\d+)?)%$/i);
  if (pctOff) {
    const amount = Number(pctOff[1]);
    const pct = Number(pctOff[3]);
    const out = amount * (1 - pct / 100);
    return { ok: true, result: `$${out.toFixed(2)}`, detail: `${amount} − ${pct}% = ${out.toFixed(2)}` };
  }

  const pctOf = s.match(/^(\d+(?:\.\d+)?)%\s*(of|от)\s*(\d+(?:\.\d+)?)$/i);
  if (pctOf) {
    const pct = Number(pctOf[1]);
    const amount = Number(pctOf[3]);
    const out = (amount * pct) / 100;
    return { ok: true, result: `$${out.toFixed(2)}`, detail: `${pct}% от ${amount} = ${out.toFixed(2)}` };
  }

  if (/^[\d.+\-*/() %]+$/.test(s) && /\d/.test(s)) {
    try {
      const expr = s.replace(/%/g, "/100");
      if (!/^[\d.+\-*/() ]+$/.test(expr)) return { ok: false };
      const val = Function(`"use strict"; return (${expr})`)() as unknown;
      if (typeof val !== "number" || !Number.isFinite(val)) return { ok: false };
      return { ok: true, result: String(Math.round(val * 100) / 100), detail: s };
    } catch {
      return { ok: false };
    }
  }
  return { ok: false };
}

function toUsd(amount: number, from: string, uzs: number): number {
  if (from === "uzs") return uzs ? amount / uzs : amount;
  if (from === "eur") return amount / 0.92;
  return amount;
}

function fromUsd(usd: number, to: string, uzs: number): number {
  if (to === "uzs") return usd * uzs;
  if (to === "eur") return usd * 0.92;
  return usd;
}

function formatNum(n: number, unit: string): string {
  if (unit === "uzs") return `${Math.round(n).toLocaleString("ru-RU")} UZS`;
  if (unit === "eur") return `€${n.toFixed(2)}`;
  return `$${n.toFixed(2)}`;
}

export function playPing(volume = 40) {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.type = "sine";
    gain.gain.value = Math.max(0.004, (volume / 100) * 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12);
  } catch {
    /* ignore */
  }
}

export function fraudScore(input: {
  registeredAt?: unknown;
  status?: string;
  pendingPays?: number;
  amountCents?: number;
  cancels?: number;
  flags?: string[];
}): { score: number; level: "low" | "medium" | "high"; factors: string[] } {
  let score = 0;
  const factors: string[] = [];
  const ageMs = input.registeredAt ? Date.now() - new Date(String(input.registeredAt)).getTime() : Infinity;
  if (Number.isFinite(ageMs) && ageMs < 86400000) {
    score += 2;
    factors.push("новый аккаунт");
  }
  if (input.status === "BLOCKED") {
    score += 3;
    factors.push("был в блоке");
  }
  if ((input.pendingPays ?? 0) >= 3) {
    score += 2;
    factors.push("несколько платежей в очереди");
  }
  if ((input.amountCents ?? 0) >= 50000) {
    score += 2;
    factors.push("сумма > $500");
  }
  if ((input.cancels ?? 0) >= 3) {
    score += 2;
    factors.push("частые отмены");
  }
  if (input.flags?.includes("blacklist")) {
    score += 5;
    factors.push("blacklist");
  } else if (input.flags?.includes("watchlist")) {
    score += 2;
    factors.push("watchlist");
  }
  if (input.flags?.includes("trusted") || input.status === "VIP") {
    score -= 2;
    factors.push("trusted/VIP");
  }
  const level = score >= 5 ? "high" : score >= 2 ? "medium" : "low";
  return { score: Math.max(0, score), level, factors };
}

export function renderCanned(body: string, vars: Record<string, string>): string {
  return body.replace(/\{([a-z_]+)\}/gi, (_, k: string) => vars[k] ?? `{${k}}`);
}

export function maskSecret(value: string, keep = 4): string {
  const s = String(value ?? "");
  if (s.length <= keep) return "•".repeat(s.length);
  return `${s.slice(0, 2)}${"•".repeat(Math.max(3, s.length - keep - 2))}${s.slice(-keep)}`;
}

export function maskPhone(value: string): string {
  const d = String(value ?? "").replace(/\D/g, "");
  if (d.length < 6) return maskSecret(value, 2);
  return `+${d.slice(0, 3)} *** ** ${d.slice(-2)}`;
}

export function telegramHref(username?: string | null, telegramId?: string | number | null): string | null {
  if (username) return `https://t.me/${String(username).replace(/^@/, "")}`;
  if (telegramId) return `https://t.me/user${telegramId}`;
  return null;
}

export type RecentItem = {
  entity_type: string;
  entity_id: string;
  label: string;
  href: string;
  at: string;
};

export function loadRecents(): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem("pc.recents") || "[]") as RecentItem[];
  } catch {
    return [];
  }
}

export function pushRecent(item: Omit<RecentItem, "at">) {
  try {
    const next = [
      { ...item, at: new Date().toISOString() },
      ...loadRecents().filter((x) => !(x.entity_type === item.entity_type && x.entity_id === item.entity_id)),
    ].slice(0, 20);
    localStorage.setItem("pc.recents", JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function loadFavorites(): RecentItem[] {
  try {
    return JSON.parse(localStorage.getItem("pc.favorites") || "[]") as RecentItem[];
  } catch {
    return [];
  }
}

export function toggleFavorite(item: Omit<RecentItem, "at">): RecentItem[] {
  const cur = loadFavorites();
  const exists = cur.some((x) => x.entity_type === item.entity_type && x.entity_id === item.entity_id);
  const next = exists
    ? cur.filter((x) => !(x.entity_type === item.entity_type && x.entity_id === item.entity_id))
    : [{ ...item, at: new Date().toISOString() }, ...cur].slice(0, 40);
  try {
    localStorage.setItem("pc.favorites", JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export const CHANGELOG = [
  {
    version: "2.14",
    items: [
      "+ Split-view шторка заказов и платежей",
      "+ Quick actions, bulk, SLA-таймеры",
      "+ Inbox + звук в колокольчике",
      "+ OmniSearch префиксы @ # $ tx:",
      "~ Плотность Compact / Comfortable",
    ],
  },
  {
    version: "2.13",
    items: ["+ Ledger CAS для платежей", "+ Три Telegram-бота", "+ Карта курьеров"],
  },
];
