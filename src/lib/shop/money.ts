export const DEFAULT_CURRENCY = "USD";

export function cents(amount: number): number {
  return Math.round(amount);
}

export function formatMoney(centsValue: number, currency = "USD"): string {
  const sign = centsValue < 0 ? "-" : "";
  const abs = Math.abs(centsValue);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "";
  if (symbol) return `${sign}${symbol}${whole}.${frac}`;
  return `${sign}${whole}.${frac} ${currency}`;
}

export function parseMoneyToCents(input: string): number | null {
  const cleaned = input.replace(/[^\d.,]/g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

export function applyDiscounts(
  priceCents: number,
  productDiscountPercent: number,
  userDiscountPercent: number,
): { unitCents: number; discountCents: number } {
  const product = clampPercent(productDiscountPercent);
  const user = clampPercent(userDiscountPercent);
  let unit = priceCents;
  if (product > 0) unit = Math.round((unit * (100 - product)) / 100);
  if (user > 0) unit = Math.round((unit * (100 - user)) / 100);
  if (unit < 0) unit = 0;
  return { unitCents: unit, discountCents: Math.max(0, priceCents - unit) };
}

export function clampPercent(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(90, Math.max(0, Math.round(n)));
}

export const DEPOSIT_PRESETS_CENTS = [500, 1000, 2500, 5000, 10000] as const;
