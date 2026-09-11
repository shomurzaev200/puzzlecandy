import { many, sql as getSql } from "./db";
import { telegramApi } from "./telegram-api";

export async function pushTelegram(telegramId: number, text: string): Promise<boolean> {
  if (!telegramId || !text) return false;
  const db = await getSql();
  const tokens = await many<{ token_enc: string }>(
    db,
    `select s.token_enc
       from bot_secrets s
       join bot_accounts a on a.id = s.bot_id
      where a.token_set = true and a.status <> 'OFFLINE'
      order by case a.kind when 'main' then 0 when 'payment' then 1 else 2 end`,
  );
  for (const row of tokens) {
    try {
      await telegramApi(row.token_enc, "sendMessage", { chat_id: telegramId, text });
      return true;
    } catch {
      /* try next bot */
    }
  }
  return false;
}
