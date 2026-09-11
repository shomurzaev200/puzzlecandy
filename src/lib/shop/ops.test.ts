import assert from "node:assert/strict";
import test from "node:test";
import {
  evalCommandCalc,
  fraudScore,
  parseOmniQuery,
  renderCanned,
  slaLevel,
  slaMinutes,
} from "./ops-client.ts";

test("omni prefixes", () => {
  assert.equal(parseOmniQuery("@ali").kind, "user");
  assert.equal(parseOmniQuery("#ORD-1").kind, "order");
  assert.equal(parseOmniQuery("$250").kind, "amount");
  assert.equal(parseOmniQuery("tx:0xabc").kind, "tx");
  assert.equal(parseOmniQuery("PAY-2026-1").kind, "payment");
});

test("command bar calculator", () => {
  const conv = evalCommandCalc("50 usd in uzs", 12750);
  assert.equal(conv.ok, true);
  if (conv.ok) assert.match(conv.result, /637/);
  const pct = evalCommandCalc("150 usd - 12%");
  assert.equal(pct.ok, true);
  if (pct.ok) assert.equal(pct.result, "$132.00");
  const math = evalCommandCalc("10 * 4 + 2");
  assert.equal(math.ok, true);
  if (math.ok) assert.equal(math.result, "42");
});

test("SLA bands", () => {
  const now = Date.now();
  assert.equal(slaLevel(new Date(now - 2 * 60000).toISOString(), now), "ok");
  assert.equal(slaLevel(new Date(now - 8 * 60000).toISOString(), now), "warn");
  assert.equal(slaLevel(new Date(now - 20 * 60000).toISOString(), now), "crit");
  assert.equal(slaMinutes(new Date(now - 8 * 60000).toISOString(), now), 8);
});

test("fraud scoring", () => {
  const low = fraudScore({ status: "VIP", flags: ["trusted"] });
  assert.equal(low.level, "low");
  const high = fraudScore({
    registeredAt: new Date().toISOString(),
    amountCents: 60000,
    pendingPays: 4,
    flags: ["blacklist"],
  });
  assert.equal(high.level, "high");
  assert.ok(high.factors.length >= 2);
});

test("canned variables", () => {
  assert.equal(
    renderCanned("Hi {name} #{order_id}", { name: "Ali", order_id: "ORD-1" }),
    "Hi Ali #ORD-1",
  );
});
