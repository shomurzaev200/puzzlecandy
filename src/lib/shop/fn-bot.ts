import { createServerFn } from "@tanstack/react-start";
import { ensureSeed } from "./seed";
import { dispatchBot, history } from "./bots";
import type { BotIncoming, BotKind } from "./types";
import { many, sql as getSql } from "./db";

export const botStart = createServerFn({ method: "POST" })
  .validator((d: { bot: BotKind; telegramId: number; username?: string; firstName?: string; startPayload?: string }) => d)
  .handler(async ({ data }) => {
    await ensureSeed();
    const incoming: BotIncoming = {
      bot: data.bot,
      telegramId: data.telegramId,
      username: data.username,
      firstName: data.firstName,
      text: "/start",
      startPayload: data.startPayload ?? null,
    };
    const reply = await dispatchBot(incoming);
    const msgs = await history(data.bot, data.telegramId);
    return { reply, history: msgs };
  });

export const botAct = createServerFn({ method: "POST" })
  .validator(
    (d: {
      bot: BotKind;
      telegramId: number;
      username?: string;
      firstName?: string;
      text?: string | null;
      callbackData?: string | null;
      photoDataUrl?: string | null;
      location?: { lat: number; lng: number } | null;
    }) => d,
  )
  .handler(async ({ data }) => {
    await ensureSeed();
    const reply = await dispatchBot({
      bot: data.bot,
      telegramId: data.telegramId,
      username: data.username,
      firstName: data.firstName,
      text: data.text,
      callbackData: data.callbackData,
      photoDataUrl: data.photoDataUrl,
      location: data.location,
    });
    return { reply };
  });

export const botHistory = createServerFn({ method: "GET" })
  .validator((d: { bot: BotKind; telegramId: number }) => d)
  .handler(async ({ data }) => {
    await ensureSeed();
    return history(data.bot, data.telegramId);
  });

export const peekSupportReplies = createServerFn({ method: "GET" })
  .validator((d: { telegramId: number }) => d)
  .handler(async ({ data }) => {
    await ensureSeed();
    const db = await getSql();
    return many(
      db,
      `select m.body, m.created_at, t.public_code
       from support_messages m
       join support_tickets t on t.id=m.ticket_id
       join shop_users u on u.id=t.user_id
       where u.telegram_id=$1 and m.sender_type='ADMIN'
       order by m.created_at desc limit 5`,
      [data.telegramId],
    );
  });
