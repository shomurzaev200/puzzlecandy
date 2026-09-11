import { ensureDbReady } from "../db";
import { many, sql as getSql } from "./db";
import { telegramApi } from "./telegram-api";
import { processTelegramUpdate } from "./telegram-outbound";
import type { BotKind } from "./types";

type BotRow = { id: string; kind: string; token_enc: string; status: string };

const offsets = new Map<string, number>();
const webhookCleared = new Set<string>();
const g = globalThis as typeof globalThis & { __pcBotPoll?: boolean };

async function pollBot(bot: BotRow) {
  if (!webhookCleared.has(bot.id)) {
    try {
      await telegramApi(bot.token_enc, "deleteWebhook", { drop_pending_updates: false });
    } catch {
      /* continue to getUpdates */
    }
    webhookCleared.add(bot.id);
  }
  const offset = offsets.get(bot.id) ?? 0;
  try {
    // Short poll: long-poll (timeout:25) starves Vite's SSR runner and freezes :8080.
    const updates = (await telegramApi(
      bot.token_enc,
      "getUpdates",
      {
        offset,
        timeout: 0,
        allowed_updates: ["message", "callback_query"],
      },
      8000,
    )) as Array<Record<string, unknown>>;
    if (!Array.isArray(updates) || !updates.length) return;
    for (const update of updates) {
      const id = Number(update.update_id);
      if (Number.isFinite(id)) offsets.set(bot.id, id + 1);
      try {
        await processTelegramUpdate({
          botId: bot.id,
          kind: bot.kind as BotKind,
          token: bot.token_enc,
          update,
        });
      } catch (err) {
        console.error("[telegram] update failed", bot.id, err);
      }
    }
  } catch (err) {
    const detail = (err as Error & { detail?: string }).detail ?? (err instanceof Error ? err.message : String(err));
    if (/can't use getUpdates|webhook/i.test(detail)) {
      try {
        await telegramApi(bot.token_enc, "deleteWebhook", { drop_pending_updates: false });
      } catch {
        /* retry next loop */
      }
      return;
    }
    const db = await getSql();
    await db.query(`update bot_accounts set last_error=$2, last_check_at=now() where id=$1`, [bot.id, detail.slice(0, 240)]);
  }
}

async function tick() {
  await ensureDbReady();
  const db = await getSql();
  const bots = await many<BotRow>(
    db,
    `select a.id, a.kind, s.token_enc, a.status
     from bot_accounts a
     join bot_secrets s on s.bot_id=a.id
     where a.token_set=true and a.status <> 'OFFLINE'`,
  );
  if (!bots.length) return;
  for (const bot of bots) {
    await pollBot(bot);
  }
}

function schedule() {
  setTimeout(() => {
    void tick()
      .catch((err) => console.error("[telegram] poll loop", err))
      .finally(() => schedule());
  }, 1500);
}

export function startBotPolling() {
  if (g.__pcBotPoll) return;
  g.__pcBotPoll = true;
  console.log("[telegram] short-poll started");
  schedule();
}
