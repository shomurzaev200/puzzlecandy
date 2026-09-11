import { ensureDbReady } from "../db.ts";
import { createInitialSuperAdmin } from "./staff.ts";

const banner = (email: string, password: string) => `
==================================================
PUZZLECANDY INITIAL SUPER_ADMIN CREATED
Email:    ${email}
Password: ${password}
==================================================
Сохраните пароль — он больше не будет показан.
`;

async function main() {
  await ensureDbReady();
  const result = await createInitialSuperAdmin();
  if (!result.created) {
    console.error("Администратор уже существует. Новых учёток через seed:admin не создаём.");
    process.exit(2);
  }
  console.log(banner(result.email, result.password));
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
