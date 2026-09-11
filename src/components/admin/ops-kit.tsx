import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, Copy, ExternalLink, Star, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ta } from "@/lib/shop/admin-i18n";
import {
  loadDensity,
  loadFavorites,
  loadRecents,
  pushRecent,
  saveDensity,
  slaLevel,
  slaMinutes,
  telegramHref,
  toggleFavorite,
  type Density,
  type RecentItem,
} from "@/lib/shop/ops-client";
import { adminNotifications, adminReadNotifications } from "@/lib/shop/fn-session";
import { opsCanned } from "@/lib/shop/fn-ops";

export function applyDensity(d: Density) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.density = d;
}

export function useDensity() {
  const [density, setDensity] = useState<Density>("comfortable");
  useEffect(() => {
    const d = loadDensity();
    setDensity(d);
    applyDensity(d);
  }, []);
  function set(next: Density) {
    setDensity(next);
    saveDensity(next);
    applyDensity(next);
  }
  return { density, set };
}

export function Drawer({
  open,
  onClose,
  title,
  kicker,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  kicker?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-bg/70">
      <button type="button" className="absolute inset-0" aria-label={ta("close")} onClick={onClose} />
      <div
        className={cn(
          "relative h-full overflow-y-auto border-l border-border bg-surface p-5 shadow-glow",
          wide ? "w-full max-w-2xl" : "w-full max-w-xl",
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {kicker ? <p className="font-mono text-[11px] tracking-[0.22em] text-cyan">{kicker}</p> : null}
            {title ? <h2 className="text-xl">{title}</h2> : null}
          </div>
          <Button variant="ghost" onClick={onClose}>
            {ta("close")}
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SlaChip({ since }: { since: unknown }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const level = slaLevel(since, now);
  const mins = slaMinutes(since, now);
  if (level == null || mins == null) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 font-mono text-[11px]",
        level === "ok" && "text-muted",
        level === "warn" && "bg-warn/10 text-warn",
        level === "crit" && "sla-blink bg-danger/15 text-danger",
      )}
    >
      {level === "ok" ? `${mins} мин` : `⏳ ${mins} мин`}
    </span>
  );
}

export function copyText(value: string, label?: string) {
  void navigator.clipboard.writeText(value).then(
    () => toast.success(label ? `Скопировано: ${label}` : "Скопировано"),
    () => toast.error("Не удалось скопировать"),
  );
}

export function QuickIcons({
  onApprove,
  onReject,
  onCopy,
  copyValue,
  telegram,
  username,
}: {
  onApprove?: () => void;
  onReject?: () => void;
  onCopy?: () => void;
  copyValue?: string;
  telegram?: string | number | null;
  username?: string | null;
}) {
  const href = telegramHref(username, telegram);
  return (
    <div className="pointer-events-none absolute right-2 top-1/2 z-10 hidden -translate-y-1/2 items-center gap-1 group-hover:flex">
      {onApprove ? (
        <button
          type="button"
          className="pointer-events-auto grid size-8 place-items-center rounded-md border border-border bg-surface text-primary"
          title="Одобрить"
          onClick={(e) => {
            e.stopPropagation();
            onApprove();
          }}
        >
          <Check className="size-3.5" />
        </button>
      ) : null}
      {onReject ? (
        <button
          type="button"
          className="pointer-events-auto grid size-8 place-items-center rounded-md border border-border bg-surface text-danger"
          title="Отклонить"
          onClick={(e) => {
            e.stopPropagation();
            onReject();
          }}
        >
          <X className="size-3.5" />
        </button>
      ) : null}
      {copyValue || onCopy ? (
        <button
          type="button"
          className="pointer-events-auto grid size-8 place-items-center rounded-md border border-border bg-surface text-muted"
          title="Копировать"
          onClick={(e) => {
            e.stopPropagation();
            if (onCopy) onCopy();
            else if (copyValue) copyText(copyValue);
          }}
        >
          <Copy className="size-3.5" />
        </button>
      ) : null}
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="pointer-events-auto grid size-8 place-items-center rounded-md border border-border bg-surface text-cyan"
          title="Открыть в Telegram"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="size-3.5" />
        </a>
      ) : null}
    </div>
  );
}

export function BulkBar({
  count,
  pages,
  children,
}: {
  count: number;
  pages?: number;
  children: ReactNode;
}) {
  if (!count) return null;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-raised px-3 py-2">
      <span className="text-sm text-muted">
        Выбрано: {count}
        {pages && pages > 1 ? ` (из ${pages} стр.)` : ""}
      </span>
      {children}
    </div>
  );
}

export function ContextMenu({
  x,
  y,
  onClose,
  items,
}: {
  x: number;
  y: number;
  onClose: () => void;
  items: Array<{ label: string; onClick: () => void; danger?: boolean }>;
}) {
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [onClose]);
  return (
    <div
      className="fixed z-50 min-w-48 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-glow"
      style={{ left: x, top: y }}
    >
      {items.map((it) => (
        <button
          key={it.label}
          type="button"
          className={cn(
            "flex min-h-10 w-full items-center px-3 text-left text-sm hover:bg-raised",
            it.danger && "text-danger",
          )}
          onClick={(e) => {
            e.stopPropagation();
            it.onClick();
            onClose();
          }}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function useRowNav<T>(rows: T[], open: (row: T) => void) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIdx((i) => Math.min(rows.length - 1, i + 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setIdx((i) => Math.max(0, i - 1));
      }
      if (e.key === "Enter" && rows[idx]) open(rows[idx]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, idx, open]);
  return { idx, setIdx };
}

export function InboxBell({ unread }: { unread: number }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Array<Record<string, unknown>>>([]);
  useEffect(() => {
    if (!open) return;
    adminNotifications()
      .then((n) => setItems(n as Array<Record<string, unknown>>))
      .catch(() => setItems([]));
  }, [open]);
  return (
    <div className="relative">
      <button
        type="button"
        className="relative grid size-11 place-items-center rounded-md border border-border text-muted"
        aria-label="Входящие"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="size-4" />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 min-w-4 rounded-full bg-primary px-1 text-center font-mono text-[10px] text-bg">
            {unread}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-[min(380px,88vw)] overflow-hidden rounded-xl border border-border bg-surface shadow-glow">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-sm">Входящие</p>
            <button
              type="button"
              className="text-xs text-cyan"
              onClick={() => {
                void adminReadNotifications();
              }}
            >
              Прочитать все
            </button>
          </div>
          <ul className="max-h-64 overflow-y-auto">
            {items.slice(0, 12).map((n) => (
              <li key={String(n.id)} className="border-b border-border px-3 py-2 text-sm">
                <p>{String(n.title)}</p>
                <p className="text-xs text-muted">{String(n.body ?? "")}</p>
              </li>
            ))}
            {!items.length ? <li className="px-3 py-6 text-sm text-muted">Нет уведомлений</li> : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function SidePins() {
  const [recents, setRecents] = useState<RecentItem[]>([]);
  const [favs, setFavs] = useState<RecentItem[]>([]);
  useEffect(() => {
    setRecents(loadRecents());
    setFavs(loadFavorites());
    const on = () => {
      setRecents(loadRecents());
      setFavs(loadFavorites());
    };
    window.addEventListener("pc-pins", on);
    return () => window.removeEventListener("pc-pins", on);
  }, []);
  if (!recents.length && !favs.length) return null;
  return (
    <div className="hidden border-t border-border px-3 py-3 text-xs lg:block">
      {favs.length ? (
        <>
          <p className="mb-1 text-[11px] uppercase tracking-wider text-faint">Избранные</p>
          {favs.slice(0, 6).map((f) => (
            <a key={`${f.entity_type}:${f.entity_id}`} href={f.href} className="block truncate py-1 text-cyan">
              ⭐ {f.label}
            </a>
          ))}
        </>
      ) : null}
      {recents.length ? (
        <>
          <p className="mb-1 mt-2 text-[11px] uppercase tracking-wider text-faint">Недавние</p>
          {recents.slice(0, 8).map((f) => (
            <a key={`${f.entity_type}:${f.entity_id}`} href={f.href} className="block truncate py-1 text-muted">
              {f.label}
            </a>
          ))}
        </>
      ) : null}
    </div>
  );
}

export function remember(item: Omit<RecentItem, "at">) {
  pushRecent(item);
  window.dispatchEvent(new Event("pc-pins"));
}

export function FavButton(item: Omit<RecentItem, "at">) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(loadFavorites().some((x) => x.entity_type === item.entity_type && x.entity_id === item.entity_id));
  }, [item.entity_id, item.entity_type]);
  return (
    <button
      type="button"
      className="grid size-9 place-items-center rounded-md border border-border"
      onClick={() => {
        const next = toggleFavorite(item);
        setOn(next.some((x) => x.entity_type === item.entity_type && x.entity_id === item.entity_id));
        window.dispatchEvent(new Event("pc-pins"));
      }}
      title="Избранное"
    >
      <Star className={cn("size-4", on && "fill-primary text-primary")} />
    </button>
  );
}

export function CannedPicker({ onPick, vars }: { onPick: (body: string) => void; vars?: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Array<{ id: string; title: string; body: string }>>([]);
  useEffect(() => {
    if (!open) return;
    opsCanned()
      .then((r) => setRows(r as Array<{ id: string; title: string; body: string }>))
      .catch(() => setRows([]));
  }, [open]);
  return (
    <div className="relative">
      <Button variant="ghost" onClick={() => setOpen((v) => !v)}>
        /
      </Button>
      {open ? (
        <div className="absolute bottom-12 left-0 z-20 w-72 overflow-hidden rounded-lg border border-border bg-surface shadow-glow">
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              className="block w-full px-3 py-2 text-left text-sm hover:bg-raised"
              onClick={() => {
                let body = r.body;
                if (vars) {
                  for (const [k, v] of Object.entries(vars)) body = body.replaceAll(`{${k}}`, v);
                }
                onPick(body);
                setOpen(false);
              }}
            >
              {r.title}
            </button>
          ))}
          {!rows.length ? <p className="px-3 py-4 text-sm text-muted">Нет шаблонов</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function Timeline({
  items,
}: {
  items: Array<{ at: string; title: string; detail?: string; kind?: string }>;
}) {
  return (
    <ol className="space-y-2 border-l border-border pl-3">
      {items.map((it, i) => (
        <li key={`${it.at}-${i}`} className="text-sm">
          <p className="font-mono text-[11px] text-faint">{String(it.at).slice(11, 16) || it.at}</p>
          <p className={it.kind === "note" ? "rounded-md bg-warn/10 px-2 py-1" : ""}>
            {it.title}
            {it.detail ? <span className="text-muted"> — {it.detail}</span> : null}
          </p>
        </li>
      ))}
      {!items.length ? <li className="text-sm text-muted">Пока нет событий</li> : null}
    </ol>
  );
}

export function Masked({ value, kind = "secret" }: { value: string; kind?: "secret" | "phone" }) {
  const [open, setOpen] = useState(false);
  const shown = open ? value : kind === "phone" ? value.replace(/(\d{3})\d+(\d{2})/, "$1 *** ** $2") : "••••••••";
  return (
    <button type="button" className="font-mono text-xs text-muted" onClick={() => setOpen((v) => !v)}>
      {shown}
    </button>
  );
}

export function PasteCatcher({ onFile, onText }: { onFile?: (file: File) => void; onText?: (text: string) => void }) {
  const ref = useRef(onFile);
  ref.current = onFile;
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      const item = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"));
      if (item && ref.current) {
        const file = item.getAsFile();
        if (file) ref.current(file);
        return;
      }
      const text = e.clipboardData?.getData("text");
      if (text && onText) onText(text);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [onText]);
  return null;
}

export function PresenceBadge({ name }: { name?: string | null }) {
  if (!name) return null;
  return <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] text-warn">🟡 Эту заявку сейчас просматривает {name}</span>;
}

export function ClaimBadge({ name }: { name?: string | null }) {
  if (!name) return null;
  return <span className="rounded-full bg-cyan/10 px-2 py-0.5 text-[11px] text-cyan">🔒 В работе у {name}</span>;
}

export function useUndoToast() {
  return useMemo(
    () => (message: string, undo: () => void) => {
      toast(message, {
        action: {
          label: "Отменить",
          onClick: undo,
        },
      });
    },
    [],
  );
}
