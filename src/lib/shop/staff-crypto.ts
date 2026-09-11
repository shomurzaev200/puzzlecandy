import { randomInt } from "node:crypto";

const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const DIGIT = "23456789";
const SPECIAL = "!@#$%^&*";
const ALL = UPPER + LOWER + DIGIT + SPECIAL;

export function generateStaffPassword(length = 20): string {
  const n = Math.max(16, length);
  const chars: string[] = [
    UPPER[randomInt(UPPER.length)] ?? "A",
    LOWER[randomInt(LOWER.length)] ?? "a",
    DIGIT[randomInt(DIGIT.length)] ?? "2",
    SPECIAL[randomInt(SPECIAL.length)] ?? "!",
  ];
  for (let i = chars.length; i < n; i += 1) {
    chars.push(ALL[randomInt(ALL.length)] ?? "x");
  }
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = randomInt(i + 1);
    const a = chars[i];
    const b = chars[j];
    if (a && b) {
      chars[i] = b;
      chars[j] = a;
    }
  }
  return chars.join("");
}

export const STAFF_ROLES = [
  "SUPER_ADMIN",
  "FINANCE_ADMIN",
  "ORDER_OPERATOR",
  "COURIER_DISPATCHER",
  "SUPPORT_AGENT",
  "ADMIN",
  "MODERATOR",
  "SUPPORT",
  "FINANCE",
  "COURIER_MANAGER",
] as const;
