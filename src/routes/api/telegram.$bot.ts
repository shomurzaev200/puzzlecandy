import { createFileRoute } from "@tanstack/react-router";
import { ensureSeed } from "@/lib/shop/seed";
import { getSetting } from "@/lib/shop/finance";
import { one, sql as getSql } from "@/lib/shop/db";
import { processTelegramUpdate, tokenForBot } from "@/lib/shop/telegram-outbound";
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
        const token = await tokenForBot(row?.id ?? raw);
        if (!token) return Response.json({ ok: false, error: "no token" }, { status: 400 });
        const update = (await request.json()) as Record<string, unknown>;
        await processTelegramUpdate({
          botId: row?.id ?? raw,
          kind: bot,
          token,
          update,
        });
        return Response.json({ ok: true });
      },
    },
  },
});
