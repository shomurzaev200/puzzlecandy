import type { AdminRole, Permission } from "./types";

export const ALL_PERMISSIONS: Permission[] = [
  "dashboard",
  "users.read",
  "users.write",
  "users.block",
  "users.balance",
  "users.message",
  "products.read",
  "products.write",
  "products.delete",
  "categories.write",
  "orders.read",
  "orders.write",
  "payments.read",
  "payments.review",
  "transactions.read",
  "couriers.read",
  "couriers.write",
  "map.read",
  "reviews.moderate",
  "support.read",
  "support.write",
  "jobs.write",
  "analytics.read",
  "notifications.read",
  "bots.manage",
  "settings.read",
  "settings.write",
  "settings.secrets",
  "audit.read",
  "errors.read",
  "roles.write",
  "export",
];

const ROLE_PERMS: Record<AdminRole, Permission[]> = {
  SUPER_ADMIN: [...ALL_PERMISSIONS],
  ADMIN: ALL_PERMISSIONS.filter((p) => p !== "roles.write" && p !== "settings.secrets"),
  MODERATOR: [
    "dashboard",
    "products.read",
    "products.write",
    "categories.write",
    "reviews.moderate",
    "orders.read",
    "notifications.read",
  ],
  SUPPORT: [
    "dashboard",
    "users.read",
    "users.message",
    "support.read",
    "support.write",
    "orders.read",
    "notifications.read",
  ],
  FINANCE: [
    "dashboard",
    "users.read",
    "users.balance",
    "payments.read",
    "payments.review",
    "transactions.read",
    "analytics.read",
    "export",
    "notifications.read",
  ],
  COURIER_MANAGER: [
    "dashboard",
    "couriers.read",
    "couriers.write",
    "orders.read",
    "orders.write",
    "map.read",
    "notifications.read",
  ],
};

export function permissionsFor(role: AdminRole): Permission[] {
  return ROLE_PERMS[role] ?? [];
}

export function can(role: AdminRole, permission: Permission): boolean {
  return permissionsFor(role).includes(permission);
}

export const ROLE_SEED: Array<{ role: AdminRole; permission: Permission }> = (
  Object.keys(ROLE_PERMS) as AdminRole[]
).flatMap((role) => ROLE_PERMS[role].map((permission) => ({ role, permission })));
