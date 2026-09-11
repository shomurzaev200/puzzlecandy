import { APIError } from "better-auth/api";
import { countAdmins } from "./admin";

/** Public email sign-up is allowed only while the admin roster is empty. */
export async function assertPublicSignupAllowed(): Promise<void> {
  try {
    const n = await countAdmins();
    if (n > 0) {
      throw APIError.from("FORBIDDEN", {
        code: "SIGNUP_DISABLED",
        message: "Регистрация закрыта. Новых сотрудников добавляет только супер-админ.",
      });
    }
  } catch (err) {
    if (err instanceof APIError) throw err;
    /* schema not ready — allow first bootstrap */
  }
}
