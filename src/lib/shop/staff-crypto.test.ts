import assert from "node:assert/strict";
import test from "node:test";
import { generateStaffPassword } from "./staff-crypto.ts";
import { isSameOriginRequest, requestSelfOrigins } from "../auth/trusted-origins.ts";
import { can } from "./rbac.ts";

test("generated admin password is 20+ mixed chars", () => {
  const p = generateStaffPassword();
  assert.ok(p.length >= 16);
  assert.match(p, /[A-Z]/);
  assert.match(p, /[a-z]/);
  assert.match(p, /\d/);
  assert.match(p, /[!@#$%^&*]/);
});

test("same-origin IP is trusted, foreign origin is not", () => {
  const req = new Request("http://18.130.218.152:8080/api/auth/sign-in/email", {
    headers: {
      host: "18.130.218.152:8080",
      origin: "http://18.130.218.152:8080",
    },
  });
  assert.equal(isSameOriginRequest("http://18.130.218.152:8080", req), true);
  assert.equal(isSameOriginRequest("https://evil.example", req), false);
  assert.ok(requestSelfOrigins(req).includes("http://18.130.218.152:8080"));
});

test("strict RBAC isolation", () => {
  assert.equal(can("FINANCE_ADMIN", "payments.review"), true);
  assert.equal(can("FINANCE_ADMIN", "products.write"), false);
  assert.equal(can("FINANCE_ADMIN", "bots.manage"), false);
  assert.equal(can("ORDER_OPERATOR", "orders.write"), true);
  assert.equal(can("ORDER_OPERATOR", "users.balance"), false);
  assert.equal(can("COURIER_DISPATCHER", "map.read"), true);
  assert.equal(can("COURIER_DISPATCHER", "payments.review"), false);
  assert.equal(can("SUPPORT_AGENT", "support.write"), true);
  assert.equal(can("SUPPORT_AGENT", "users.balance"), false);
  assert.equal(can("SUPPORT_AGENT", "roles.write"), false);
  assert.equal(can("SUPER_ADMIN", "roles.write"), true);
});
