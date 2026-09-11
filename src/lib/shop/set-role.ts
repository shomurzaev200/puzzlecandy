import { ensureDbReady } from "../db.ts";
import { sql, many, one } from "./db.ts";
import { audit } from "./audit.ts";
import { STAFF_ROLES } from "./staff-crypto.ts";

type AdminRow = {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
  status: string;
  user_id: string;
};

function usage() {
  console.log(`Использование:
  npm run set-role
  npm run set-role -- EMAIL SUPER_ADMIN

Роли: ${STAFF_ROLES.join(", ")}
`);
}

async function main() {
  await ensureDbReady();
  const db = await sql();
  const rows = await many<AdminRow>(db, `select id, email, name, role, status, user_id from admins order by created_at`);
  if (!rows.length) {
    console.error("Админов нет. Сначала: npm run seed:admin");
    process.exit(2);
  }

  const emailArg = process.argv[2]?.trim();
  const roleArg = process.argv[3]?.trim().toUpperCase();

  if (!emailArg) {
    console.log("Текущие сотрудники:\n");
    for (const a of rows) {
      console.log(`  ${a.email ?? "—"}  |  ${a.name ?? "—"}  |  ${a.role}  |  ${a.status}`);
    }
    usage();
    return;
  }

  if (!roleArg || !(STAFF_ROLES as readonly string[]).includes(roleArg)) {
    console.error(`Неизвестная роль: ${roleArg ?? "(пусто)"}`);
    usage();
    process.exit(2);
  }

  const needle = emailArg.toLowerCase();
  const hit =
    rows.find(
      (a) =>
        a.email?.toLowerCase() === needle ||
        a.email?.toLowerCase().includes(needle) ||
        a.name?.toLowerCase().includes(needle) ||
        a.user_id === emailArg,
    ) ?? (await one<AdminRow>(db, `select id, email, name, role, status, user_id from admins where id=$1`, [emailArg]));
  if (!hit) {
    console.error(`Сотрудник не найден: ${emailArg}`);
    for (const a of rows) console.log(`  ${a.email}  ${a.name}  ${a.role}`);
    process.exit(2);
  }

  await db.query(`update admins set role=$2, status='ACTIVE', updated_at=now() where id=$1`, [hit.id, roleArg]);
  await audit(db, {
    actorId: "system",
    actorType: "SYSTEM",
    action: "roles.write",
    entity: "admin",
    entityId: hit.id,
    oldValue: { role: hit.role },
    newValue: { role: roleArg, source: "set-role" },
  });
  console.log(`Роль обновлена: ${hit.email ?? hit.name}  ${hit.role} → ${roleArg}`);
  console.log("Выйдите из панели и войдите снова, чтобы права применились.");
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
