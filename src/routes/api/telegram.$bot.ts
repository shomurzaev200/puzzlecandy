import { createFileRoute } from "@tanstack/react-router";
import { dispatchBot } from "@/lib/shop/bots";
import { ensureSeed } from "@/lib/shop/seed";
import { getSetting } from "@/lib/shop/finance";
import { one, sql as getSql } from "@/lib/shop/db";
import type { BotKind } from "@/lib/shop/types";

export const Route = createFileRoute("/api/telegram/$bot")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        await ensureSeed();
        const db = await getSql();
        const raw = params.bot;
        const row = await one<{ id: string; kind: BotKind }>(
          db,
          `select id, kind from bot_accounts where id=$1 or kind=$1 limit 1`,
          [raw],
        );
        const bot = (row?.kind ?? raw) as BotKind;
        if (!["main", "payment", "courier", "support", "other"].includes(bot)) {
          return Response.json({ ok: false }, { status: 404 });
        }
        const secret = request.headers.get("x-telegram-bot-api-secret-token");
        const expected = await getSetting<{ webhook_secret?: string }>("secrets", {});
        if (expected.webhook_secret && secret !== expected.webhook_secret) {
          return Response.json({ ok: false }, { status: 401 });
        }
        const update = (await request.json()) as Record<string, unknown>;
        const message = (update.message ?? update.callback_query) as Record<string, unknown> | undefined;
        const from = ((message?.from ?? (update.callback_query as { from?: Record<string, unknown> } | undefined)?.from) ??
          {}) as Record<string, unknown>;
        const chatMessage = (update.message ?? {}) as Record<string, unknown>;
        const callback = (update.callback_query ?? {}) as Record<string, unknown>;
        const location = chatMessage.location as { latitude?: number; longitude?: number } | undefined;
        const photos = chatMessage.photo as Array<{ file_id: string }> | undefined;
        const text =
          typeof chatMessage.text === "string"
            ? chatMessage.text
            : typeof callback.data === "string"
              ? undefined
              : undefined;
        const telegramId = Number(from.id);
        if (!telegramId) return Response.json({ ok: true });
        const reply = await dispatchBot({
          bot: bot === "support" || bot === "other" ? "main" : bot,
          telegramId,
          username: typeof from.username === "string" ? from.username : null,
          firstName: typeof from.first_name === "string" ? from.first_name : null,
          lastName: typeof from.last_name === "string" ? from.last_name : null,
          languageCode: typeof from.language_code === "string" ? from.language_code : null,
          text,
          callbackData: typeof callback.data === "string" ? callback.data : null,
          telegramFileId: photos?.at(-1)?.file_id ?? null,
          location: location?.latitude != null ? { lat: location.latitude, lng: location.longitude ?? 0 } : null,
        });
        await db.query(`update bot_accounts set last_update_at=now(), status='ONLINE', last_error=null where kind=$1 or id=$2`, [bot, row?.id ?? raw]);
        return Response.json({ ok: true, replies: reply.messages.length });
      },
    },
  },
});
