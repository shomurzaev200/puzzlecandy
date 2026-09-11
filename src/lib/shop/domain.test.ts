import assert from "node:assert/strict";
import test from "node:test";
import { applyDiscounts, clampPercent, formatMoney, parseMoneyToCents } from "./money.ts";
import { canTransition } from "./workflow.ts";
import { can, permissionsFor } from "./rbac.ts";
import { STRINGS } from "./i18n.ts";
import { ADMIN, statusLabel, ta, eventLabel } from "./admin-i18n.ts";

test("money formatting and parsing", () => {
  assert.equal(formatMoney(0), "$0.00");
  assert.equal(formatMoney(12345), "$123.45");
  assert.equal(formatMoney(-500), "-$5.00");
  assert.equal(parseMoneyToCents("50"), 5000);
  assert.equal(parseMoneyToCents("$10.25"), 1025);
  assert.equal(parseMoneyToCents("nope"), null);
});

test("discounts stack product then personal, server-side only", () => {
  const { unitCents, discountCents } = applyDiscounts(10000, 10, 10);
  assert.equal(unitCents, 8100);
  assert.equal(discountCents, 1900);
  assert.equal(clampPercent(150), 90);
  assert.equal(clampPercent(-4), 0);
});

test("order graph blocks illegal jumps", () => {
  assert.equal(canTransition("NEW", "PAID"), true);
  assert.equal(canTransition("PAID", "PROCESSING"), true);
  assert.equal(canTransition("COMPLETED", "PAID"), false);
  assert.equal(canTransition("CANCELLED", "PAID"), false);
});

test("double-approval CAS: second claim must no-op", () => {
  const payment = { status: "PENDING", amount: 5000, balance: 0 };
  function approve() {
    if (payment.status !== "PENDING") return { ok: true, duplicate: true as const };
    payment.status = "APPROVED";
    payment.balance += payment.amount;
    return { ok: true, duplicate: false as const };
  }
  const a = approve();
  const b = approve();
  assert.equal(a.duplicate, false);
  assert.equal(b.duplicate, true);
  assert.equal(payment.balance, 5000);
});

test("purchase refuses when funds or stock missing", () => {
  function buy(balance: number, stock: number, price: number) {
    if (stock < 1) return "UNAVAILABLE";
    if (balance < price) return "INSUFFICIENT";
    return "OK";
  }
  assert.equal(buy(100, 0, 50), "UNAVAILABLE");
  assert.equal(buy(40, 2, 50), "INSUFFICIENT");
  assert.equal(buy(80, 2, 50), "OK");
});

test("RBAC finance cannot delete products", () => {
  assert.equal(can("FINANCE", "payments.review"), true);
  assert.equal(can("FINANCE", "products.delete"), false);
  assert.equal(can("SUPER_ADMIN", "roles.write"), true);
  assert.ok(permissionsFor("SUPPORT").includes("support.write"));
  assert.equal(can("FINANCE_ADMIN", "settings.secrets"), false);
  assert.equal(can("ORDER_OPERATOR", "payments.review"), false);
  assert.equal(can("KYC_REVIEWER", "kyc.write"), true);
  assert.equal(can("KYC_REVIEWER", "payments.review"), false);
  assert.equal(can("FINANCE", "kyc.write"), false);
  assert.equal(can("MANAGER", "users.balance"), false);
});

test("i18n packs cover ru/uz/en for every key", () => {
  for (const [key, pack] of Object.entries(STRINGS)) {
    assert.ok(pack.ru, key);
    assert.ok(pack.uz, key);
    assert.ok(pack.en, key);
  }
});

test("shop strings are PUZZLECANDY, never DAZZLE", () => {
  const welcome = STRINGS.welcome.ru;
  assert.match(welcome, /PUZZLECANDY/);
  assert.equal(welcome.includes("DAZZLE"), false);
  assert.match(STRINGS.btn_jobs.ru, /РАБОТА/);
  assert.match(STRINGS.btn_exchange.ru, /ОБМЕННИК/);
});

test("admin i18n is Russian-first and multilingual", () => {
  for (const [key, pack] of Object.entries(ADMIN)) {
    assert.ok(pack.ru, key);
    assert.ok(pack.uz, key);
    assert.ok(pack.en, key);
  }
  assert.equal(ta("nav_dashboard"), "Главная");
  assert.equal(ta("nav_payments"), "Платежи");
  assert.equal(statusLabel("PENDING"), "На проверке");
  assert.equal(statusLabel("COURIER_ASSIGNED"), "Курьер назначен");
  assert.equal(ta("brand"), "PUZZLECANDY");
  assert.equal(ta("qa_product").includes("Добавить товар"), true);
  assert.equal(ta("attention"), "Требует внимания");
  assert.equal(eventLabel("PAYMENT_PENDING"), "Новый платёж");
  assert.equal(eventLabel("KYC_PENDING"), "Новая KYC заявка");
  assert.equal(statusLabel("SUBMITTED"), "Скриншот получен");
});

test("same credit amount allocates distinct pay amounts", () => {
  const used = new Set<number>();
  function alloc(credit: number) {
    let pay = credit;
    while (used.has(pay)) pay += 1;
    used.add(pay);
    return pay;
  }
  assert.equal(alloc(50000), 50000);
  assert.equal(alloc(50000), 50001);
  assert.equal(alloc(50000), 50002);
  assert.equal(used.size, 3);
});

test("KYC and payment bot strings exist in all languages", () => {
  for (const key of ["pay_menu", "pay_btn_topup", "pay_btn_copy", "kyc_intro", "kyc_sent", "handler_error", "deposit_created"]) {
    assert.ok(STRINGS[key]?.ru, key);
    assert.ok(STRINGS[key]?.uz, key);
    assert.ok(STRINGS[key]?.en, key);
  }
});

