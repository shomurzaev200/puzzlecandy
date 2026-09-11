import type { BotKind, BotReply, InlineButton, KeyboardButton } from "./types";
import { dispatchBot } from "./bots";
import { one, sql as getSql } from "./db";
import { telegramApi, telegramApiForm } from "./telegram-api";

function keyboardMarkup(keyboard?: KeyboardButton[][], requestLocation?: boolean) {
  if (!keyboard?.length) return undefined;
  return {
    keyboard: keyboard.map((row) =>
      row.map((b) => ({
        text: b.text,
        request_location: Boolean(b.requestLocation || requestLocation),
      })),
    ),
    resize_keyboard: true,
  };
}

function inlineMarkup(inline?: InlineButton[][]) {
  if (!inline?.length) return undefined;
  return {
    inline_keyboard: inline.map((row) =>
      row.map((b) => ({
        text: b.text,
        callback_data: b.data.slice(0, 64),
      })),
    ),
  };
}

function chunks(text: string, size = 3900): string[] {
  if (text.length <= size) return [text];
  const out: string[] = [];
  let rest = text;
  while (rest.length) {
    out.push(rest.slice(0, size));
    rest = rest.slice(size);
  }
  return out;
}

async function sendPhoto(token: string, chatId: number, photoUrl: string, caption: string, replyMarkup: unknown) {
  if (photoUrl.startsWith("data:")) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(photoUrl);
    if (!match) return false;
    const form = new FormData();
    form.set("chat_id", String(chatId));
    if (caption) form.set("caption", caption.slice(0, 1024));
    if (replyMarkup) form.set("reply_markup", JSON.stringify(replyMarkup));
    const bytes = Buffer.from(match[2] ?? "", "base64");
    form.set("photo", new Blob([bytes], { type: match[1] ?? "image/jpeg" }), "photo.jpg");
    await telegramApiForm(token, "sendPhoto", form);
    return true;
  }
  if (/^https?:\/\//i.test(photoUrl)) {
    await telegramApi(token, "sendPhoto", {
      chat_id: chatId,
      photo: photoUrl,
      caption: caption.slice(0, 1024) || undefined,
      reply_markup: replyMarkup,
    });
    return true;
  }
  return false;
}

export async function deliverReply(token: string, chatId: number, reply: BotReply, callbackId?: string) {
  if (callbackId) {
    try {
      await telegramApi(token, "answerCallbackQuery", { callback_query_id: callbackId });
    } catch {
      /* ignore */
    }
  }
  const kb = keyboardMarkup(reply.keyboard, reply.requestLocation);
  for (let i = 0; i < reply.messages.length; i += 1) {
    const msg = reply.messages[i];
    if (!msg) continue;
    const isLast = i === reply.messages.length - 1;
    const markup = isLast ? (inlineMarkup(msg.inline) ?? kb) : inlineMarkup(msg.inline);
    if (msg.photoUrl) {
      try {
        const ok = await sendPhoto(token, chatId, msg.photoUrl, msg.text, markup);
        if (ok) continue;
      } catch {
        /* fall through to text */
      }
    }
    const parts = chunks(msg.text || ".");
    for (let p = 0; p < parts.length; p += 1) {
      const lastPart = isLast && p === parts.length - 1;
      await telegramApi(token, "sendMessage", {
        chat_id: chatId,
        text: parts[p],
        reply_markup: lastPart ? markup : undefined,
      });
    }
  }
  if (!reply.messages.length && kb) {
    await telegramApi(token, "sendMessage", {
      chat_id: chatId,
      text: "·",
      reply_markup: kb,
    });
  }
}

async function fileToDataUrl(token: string, fileId: string): Promise<string | null> {
  try {
    const file = (await telegramApi(token, "getFile", { file_id: fileId })) as { file_path?: string };
    if (!file.file_path) return null;
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`, {
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type") || "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function processTelegramUpdate(opts: {
  botId: string;
  kind: BotKind;
  token: string;
  update: Record<string, unknown>;
}): Promise<void> {
  const update = opts.update;
  const callback = (update.callback_query ?? null) as Record<string, unknown> | null;
  const message = ((update.message ?? callback?.message) ?? {}) as Record<string, unknown>;
  const from = ((message.from ?? callback?.from) ?? {}) as Record<string, unknown>;
  const telegramId = Number(from.id);
  if (!telegramId) return;

  const location = message.location as { latitude?: number; longitude?: number } | undefined;
  const photos = message.photo as Array<{ file_id: string }> | undefined;
  const video = (message.video ?? message.video_note) as { file_id?: string } | undefined;
  let text = typeof message.text === "string" ? message.text : null;
  let startPayload: string | null = null;
  if (text?.startsWith("/start")) {
    startPayload = text.slice(6).trim() || null;
    text = "/start";
  }
  const callbackData = typeof callback?.data === "string" ? callback.data : null;
  const fileId = photos?.at(-1)?.file_id ?? video?.file_id ?? null;
  const photoDataUrl = photos?.at(-1)?.file_id ? await fileToDataUrl(opts.token, photos.at(-1)!.file_id) : null;
  const kind: BotKind = opts.kind === "support" || opts.kind === "other" ? "main" : opts.kind;

  const reply = await dispatchBot({
    bot: kind,
    telegramId,
    username: typeof from.username === "string" ? from.username : null,
    firstName: typeof from.first_name === "string" ? from.first_name : null,
    lastName: typeof from.last_name === "string" ? from.last_name : null,
    languageCode: typeof from.language_code === "string" ? from.language_code : null,
    text: callbackData ? null : text,
    callbackData,
    telegramFileId: fileId,
    photoDataUrl,
    location: location?.latitude != null ? { lat: location.latitude, lng: location.longitude ?? 0 } : null,
    startPayload,
  });

  const db = await getSql();
  await db.query(
    `update bot_accounts set last_update_at=now(), status='ONLINE', last_error=null where id=$1 or kind=$2`,
    [opts.botId, opts.kind],
  );
  await deliverReply(opts.token, telegramId, reply, typeof callback?.id === "string" ? callback.id : undefined);
}

export async function tokenForBot(botId: string): Promise<string | null> {
  const db = await getSql();
  const row = await one<{ token_enc: string }>(db, `select token_enc from bot_secrets where bot_id=$1`, [botId]);
  return row?.token_enc ?? null;
}
