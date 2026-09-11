import { useEffect, useRef, useState } from "react";
import { Camera, ChevronLeft, MapPin, Paperclip, SendHorizonal } from "lucide-react";
import { botAct, botHistory, botStart } from "@/lib/shop/fn-bot";
import type { BotKind, BotMessageOut, KeyboardButton } from "@/lib/shop/types";
import { cn } from "@/lib/utils";

type ChatItem = {
  id: string;
  direction: "IN" | "OUT";
  text: string;
  photoUrl?: string | null;
  inline?: { text: string; data: string }[][];
};

function tgKey(bot: BotKind) {
  return `puzzlcandy.tg.${bot}`;
}

function loadIdentity(bot: BotKind) {
  try {
    const raw = localStorage.getItem(tgKey(bot));
    if (raw) return JSON.parse(raw) as { telegramId: number; firstName: string; username: string };
  } catch {
    /* ignore */
  }
  const telegramId = 700000000 + Math.floor(Math.random() * 200000000);
  const firstName = bot === "courier" ? "Курьер" : bot === "payment" ? "Плательщик" : "Клиент";
  const username = `${bot === "courier" ? "courier" : bot === "payment" ? "payer" : "client"}_${String(telegramId).slice(-4)}`;
  const ident = { telegramId, firstName, username };
  localStorage.setItem(tgKey(bot), JSON.stringify(ident));
  return ident;
}

export function TelegramPhone({
  bot,
  title,
}: {
  bot: BotKind;
  title: string;
}) {
  const [ident, setIdent] = useState<{ telegramId: number; firstName: string; username: string } | null>(null);
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [keyboard, setKeyboard] = useState<KeyboardButton[][]>([]);
  const [draft, setDraft] = useState("");
  const [wantPhoto, setWantPhoto] = useState(false);
  const [wantLoc, setWantLoc] = useState(false);
  const [busy, setBusy] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setIdent(loadIdentity(bot));
  }, [bot]);

  useEffect(() => {
    if (!ident) return;
    let cancelled = false;
    (async () => {
      const hist = await botHistory({ data: { bot, telegramId: ident.telegramId } });
      if (cancelled) return;
      if (hist.length) {
        setItems(
          hist
            .filter((h) => {
              const text = String(h.text ?? "");
              if (h.direction === "IN" && /^(cat|prd|buy|dep|cacc|crej|revstar):/.test(text)) return false;
              return Boolean(text) || Boolean((h.payload as { photo?: string } | null)?.photo);
            })
            .map((h) => {
              const payload = (h.payload ?? {}) as { inline?: ChatItem["inline"]; photo?: string };
              return {
                id: String(h.id),
                direction: h.direction as "IN" | "OUT",
                text: String(h.text ?? ""),
                inline: payload.inline,
                photoUrl: payload.photo,
              };
            }),
        );
      }
      const started = await botStart({
        data: {
          bot,
          telegramId: ident.telegramId,
          firstName: ident.firstName,
          username: ident.username,
        },
      });
      if (cancelled) return;
      applyReply(started.reply.messages, started.reply.keyboard, started.reply.requestPhoto, started.reply.requestLocation);
      setReady(true);
    })().catch(() => setReady(true));
    return () => {
      cancelled = true;
    };
  }, [bot, ident]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [items.length]);

  useEffect(() => {
    if (!ident) return;
    const t = window.setInterval(() => {
      botHistory({ data: { bot, telegramId: ident.telegramId } })
        .then((hist) => {
          setItems((prev) => {
            const known = new Set(prev.map((m) => m.text + m.direction));
            const extras: ChatItem[] = [];
            for (const h of hist) {
              const payload = (h.payload ?? {}) as { inline?: ChatItem["inline"]; photo?: string };
              const item: ChatItem = {
                id: String(h.id),
                direction: h.direction as "IN" | "OUT",
                text: String(h.text ?? ""),
                inline: payload.inline,
                photoUrl: payload.photo,
              };
              if (!known.has(item.text + item.direction) && item.direction === "OUT") extras.push(item);
            }
            return extras.length ? [...prev, ...extras] : prev;
          });
        })
        .catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(t);
  }, [ident, bot]);

  function applyReply(
    messages: BotMessageOut[],
    kb?: KeyboardButton[][],
    photo?: boolean,
    loc?: boolean,
  ) {
    setItems((prev) => [
      ...prev,
      ...messages.map((m, i) => ({
        id: `${Date.now()}-${i}`,
        direction: "OUT" as const,
        text: m.text,
        photoUrl: m.photoUrl,
        inline: m.inline,
      })),
    ]);
    if (kb) setKeyboard(kb);
    setWantPhoto(Boolean(photo));
    setWantLoc(Boolean(loc));
  }

  async function send(payload: {
    text?: string | null;
    callbackData?: string | null;
    photoDataUrl?: string | null;
    location?: { lat: number; lng: number } | null;
  }) {
    if (!ident || busy) return;
    setBusy(true);
    if (payload.text) {
      setItems((prev) => [...prev, { id: `in-${Date.now()}`, direction: "IN", text: payload.text! }]);
    }
    try {
      const res = await botAct({
        data: {
          bot,
          telegramId: ident.telegramId,
          firstName: ident.firstName,
          username: ident.username,
          ...payload,
        },
      });
      applyReply(res.reply.messages, res.reply.keyboard, res.reply.requestPhoto, res.reply.requestLocation);
    } finally {
      setBusy(false);
    }
  }

  function onFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result ?? "");
      setItems((prev) => [...prev, { id: `ph-${Date.now()}`, direction: "IN", text: "📷 скриншот", photoUrl: url }]);
      void send({ photoDataUrl: url, text: null });
    };
    reader.readAsDataURL(file);
  }

  if (!ident) {
    return (
      <div className="grid-bg flex min-h-screen items-center justify-center px-3 py-6">
        <div className="h-[min(80vh,720px)] w-full max-w-[430px] rounded-[28px] border border-border-strong bg-tg" />
      </div>
    );
  }

  return (
    <div className="grid-bg flex min-h-screen items-center justify-center px-3 py-6">
      <div className="flex w-full max-w-[430px] flex-col gap-3">
        <div className="flex items-center justify-between text-xs text-muted">
          <a href="/" className="inline-flex items-center gap-1 text-primary">
            <ChevronLeft className="size-4" /> Назад
          </a>
          <span className="font-mono">
            @{ident.username} · {ident.telegramId}
          </span>
        </div>
        <div className="overflow-hidden rounded-[28px] border border-border-strong bg-tg shadow-[0_0_40px_color-mix(in_oklab,var(--color-primary)_18%,transparent)]">
          <header className="flex items-center gap-3 bg-tg-bar px-4 py-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-primary/20 font-mono text-xs text-primary">
              PC
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-fg">{title}</p>
              <p className="text-[11px] text-cyan">{ready ? "в сети" : "подключение…"}</p>
            </div>
          </header>
          <div ref={scroller} className="h-[min(62vh,560px)] space-y-3 overflow-y-auto bg-tg-chat px-3 py-4">
            {items.map((m) => (
              <div key={m.id} className={cn("flex", m.direction === "IN" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[86%] rounded-xl px-3 py-2 text-[13px] leading-relaxed whitespace-pre-wrap",
                    m.direction === "IN" ? "bg-tg-mine text-fg" : "bg-tg-bubble text-fg",
                  )}
                >
                  {m.photoUrl ? (
                    <img src={m.photoUrl} alt="" className="mb-2 max-h-48 w-full rounded-md object-cover" />
                  ) : null}
                  {m.text}
                  {m.inline?.length ? (
                    <div className="mt-2 space-y-1">
                      {m.inline.map((row, ri) => (
                        <div key={ri} className="flex gap-1">
                          {row.map((b) => (
                            <button
                              key={b.data}
                              type="button"
                              className="min-h-9 flex-1 rounded-md border border-cyan/30 bg-bg/40 px-2 text-[12px] text-cyan"
                              onClick={() => send({ callbackData: b.data })}
                            >
                              {b.text}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {keyboard.length ? (
            <div className="grid gap-1 bg-tg-bar p-2">
              {keyboard.map((row, i) => (
                <div key={i} className="flex gap-1">
                  {row.map((b) => (
                    <button
                      key={b.text}
                      type="button"
                      className="min-h-11 flex-1 rounded-md bg-raised px-2 text-[12px] text-fg"
                      onClick={() => {
                        if (b.requestLocation) {
                          void send({ location: { lat: 41.2995, lng: 69.2401 }, text: "📍 локация" });
                          return;
                        }
                        void send({ text: b.text });
                      }}
                    >
                      {b.text}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-2 bg-tg-bar px-3 py-2">
            <button
              type="button"
              className="text-muted"
              onClick={() => fileRef.current?.click()}
              aria-label="Attach"
            >
              <Paperclip className="size-5" />
            </button>
            {wantPhoto ? (
              <button type="button" className="text-primary" onClick={() => fileRef.current?.click()} aria-label="Photo">
                <Camera className="size-5" />
              </button>
            ) : null}
            {wantLoc ? (
              <button
                type="button"
                className="text-cyan"
                aria-label="Location"
                onClick={() => send({ location: { lat: 41.2995, lng: 69.2401 }, text: "📍 локация" })}
              >
                <MapPin className="size-5" />
              </button>
            ) : null}
            <input
              className="min-h-11 flex-1 rounded-md bg-tg px-3 text-sm text-fg outline-none"
              placeholder="Сообщение"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim()) {
                  const v = draft;
                  setDraft("");
                  void send({ text: v });
                }
              }}
            />
            <button
              type="button"
              className="text-primary"
              aria-label="Send"
              onClick={() => {
                if (!draft.trim()) return;
                const v = draft;
                setDraft("");
                void send({ text: v });
              }}
            >
              <SendHorizonal className="size-5" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
