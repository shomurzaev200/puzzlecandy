import { auth } from "@/lib/auth/server";
import { asInt, one, sql as getSql } from "./db";
import { nid } from "./ids";
import { audit } from "./audit";
import { readClientIp } from "./request-ip";
import { generateStaffPassword } from "./staff-crypto";
import type { AdminRole } from "./types";

export { generateStaffPassword, STAFF_ROLES } from "./staff-crypto";

async function hashPassword(password: string): Promise<string> {
  const ctx = await auth.$context;
  return ctx.password.hash(password);
}

export async function provisionCredentialUser(opts: {
  email: string;
  name: string;
  password: string;
}): Promise<{ userId: string; created: boolean }> {
  const db = await getSql();
  const email = opts.email.trim().toLowerCase();
  const existing = await one<{ id: string }>(db, `select id from "user" where email=$1`, [email]);
  const hash = await hashPassword(opts.password);
  if (existing) {
    const acc = await one<{ id: string }>(
      db,
      `select id from account where "userId"=$1 and "providerId"='credential'`,
      [existing.id],
    );
    if (acc) {
      await db.query(`update account set password=$2, "updatedAt"=now() where id=$1`, [acc.id, hash]);
    } else {
      await db.query(
        `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
         values ($1,$2,'credential',$3,$4,now(),now())`,
        [nid("acc"), existing.id, existing.id, hash],
      );
    }
    return { userId: existing.id, created: false };
  }
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({
    email,
    name: opts.name,
    emailVerified: true,
  });
  await db.query(
    `insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
     values ($1,$2,'credential',$3,$4,now(),now())`,
    [nid("acc"), user.id, user.id, hash],
  );
  return { userId: user.id, created: true };
}

export async function createStaff(opts: {
  actorId: string;
  email: string;
  name: string;
  role: AdminRole;
  password?: string;
  mustChangePassword?: boolean;
}): Promise<{ adminId: string; password: string | null; email: string }> {
  if (opts.role === "SUPER_ADMIN") {
    throw new Error("Нельзя выдать роль SUPER_ADMIN через форму. Используйте seed:admin.");
  }
  const password = opts.password?.trim() || generateStaffPassword();
  const { userId } = await provisionCredentialUser({
    email: opts.email,
    name: opts.name,
    password,
  });
  const db = await getSql();
  const already = await one<{ id: string }>(db, `select id from admins where user_id=$1`, [userId]);
  if (already) {
    await db.query(
      `update admins set email=$2, name=$3, role=$4, status='ACTIVE', must_change_password=$5, updated_at=now() where id=$1`,
      [already.id, opts.email.trim().toLowerCase(), opts.name, opts.role, opts.mustChangePassword ?? true],
    );
    await audit(db, {
      actorId: opts.actorId,
      actorType: "ADMIN",
      action: "staff.update",
      entity: "admin",
      entityId: already.id,
      newValue: { role: opts.role, email: opts.email },
      ip: readClientIp(),
    });
    return { adminId: already.id, password, email: opts.email.trim().toLowerCase() };
  }
  const id = nid("adm");
  await db.query(
    `insert into admins (id, user_id, email, name, role, status, must_change_password)
     values ($1,$2,$3,$4,$5,'ACTIVE',$6)`,
    [id, userId, opts.email.trim().toLowerCase(), opts.name, opts.role, opts.mustChangePassword ?? true],
  );
  await audit(db, {
    actorId: opts.actorId,
    actorType: "ADMIN",
    action: "staff.create",
    entity: "admin",
    entityId: id,
    newValue: { role: opts.role, email: opts.email },
    ip: readClientIp(),
  });
  return { adminId: id, password, email: opts.email.trim().toLowerCase() };
}

export async function revokeStaffSessions(userId: string): Promise<number> {
  const db = await getSql();
  const res = await db.query(`delete from session where "userId"=$1`, [userId]);
  return asInt((res as { rowCount?: number }).rowCount);
}

export async function disableStaff(opts: { adminId: string; actorId: string }): Promise<void> {
  const db = await getSql();
  const target = await one<{ id: string; user_id: string; role: string }>(
    db,
    `select id, user_id, role from admins where id=$1`,
    [opts.adminId],
  );
  if (!target) throw new Error("Сотрудник не найден");
  if (target.role === "SUPER_ADMIN") {
    const n = await one<{ n: number }>(
      db,
      `select count(*)::int as n from admins where role='SUPER_ADMIN' and status='ACTIVE'`,
    );
    if (asInt(n?.n) <= 1) throw new Error("Нельзя отключить последнего супер-админа");
  }
  await db.query(`update admins set status='DISABLED', updated_at=now() where id=$1`, [opts.adminId]);
  await revokeStaffSessions(target.user_id);
  await audit(db, {
    actorId: opts.actorId,
    actorType: "ADMIN",
    action: "staff.disable",
    entity: "admin",
    entityId: opts.adminId,
    ip: readClientIp(),
  });
}

export async function enableStaff(opts: { adminId: string; actorId: string }): Promise<void> {
  const db = await getSql();
  await db.query(`update admins set status='ACTIVE', updated_at=now() where id=$1`, [opts.adminId]);
  await audit(db, {
    actorId: opts.actorId,
    actorType: "ADMIN",
    action: "staff.enable",
    entity: "admin",
    entityId: opts.adminId,
    ip: readClientIp(),
  });
}

export async function createInitialSuperAdmin(opts?: {
  email?: string;
  name?: string;
}): Promise<{ email: string; password: string; created: boolean }> {
  const db = await getSql();
  const existing = await one<{ n: number }>(db, `select count(*)::int as n from admins`);
  if (asInt(existing?.n) > 0) {
    return { email: "", password: "", created: false };
  }
  const email = (opts?.email ?? process.env.ADMIN_EMAIL ?? "admin@puzzlecandy.internal").trim().toLowerCase();
  const name = opts?.name ?? "SUPER_ADMIN";
  const password = generateStaffPassword();
  const { userId } = await provisionCredentialUser({ email, name, password });
  const id = nid("adm");
  await db.query(
    `insert into admins (id, user_id, email, name, role, status, must_change_password)
     values ($1,$2,$3,$4,'SUPER_ADMIN','ACTIVE', true)`,
    [id, userId, email, name],
  );
  await audit(db, {
    actorId: userId,
    actorType: "ADMIN",
    action: "admin.bootstrap",
    entity: "admin",
    entityId: id,
    newValue: { email, source: "seed:admin" },
  });
  return { email, password, created: true };
}
