import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, Field, PageTitle } from "./shell";
import { purposeLabel, ta } from "@/lib/shop/admin-i18n";
import {
  adminAccountPurpose,
  adminAccountStatus,
  adminBots,
  adminCheckAccount,
  adminCheckBot,
  adminConfirmQr,
  adminDeleteAccount,
  adminDeleteBot,
  adminPollAuth,
  adminReconnectBot,
  adminRevealBotToken,
  adminSaveBot,
  adminSaveRouting,
  adminStartPhone,
  adminStartQr,
  adminToggleBot,
  adminVerifyBotToken,
  adminVerifyPhone,
} from "@/lib/shop/fn-admin";
import type { AccountPurpose, BotPurpose, TelegramRouting } from "@/lib/shop/telegram-connect";

type BotsPayload = {
  bots: Array<Record<string, unknown>>;
  accounts: Array<Record<string, unknown>>;
  routing: TelegramRouting;
  personal: Array<Record<string, unknown>>;
};

const BOT_PURPOSES: BotPurpose[] = ["main", "payment", "courier", "support", "other"];
const ACC_PURPOSES: AccountPurpose[] = ["payment", "operator", "courier", "support", "work", "other"];
const TABS = ["bots", "accounts", "pay", "cour", "sup", "ntf"] as const;

function useLoad(fn: () => Promise<BotsPayload>, deps: unknown[] = []) {
  const [data, setData] = useState<BotsPayload | null>(null);
  const reload = () => {
    fn().then(setData).catch(() => setData(null));
  };
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, reload };
}

function fmt(iso: unknown) {
  if (!iso) return "—";
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

export function BotsPage() {
  const { data, reload } = useLoad(() => adminBots() as Promise<BotsPayload>);
  const [tab, setTab] = useState<(typeof TABS)[number]>(() => {
    try {
      const stored = sessionStorage.getItem("pc.bots.tab");
      if (stored && (TABS as readonly string[]).includes(stored)) return stored as (typeof TABS)[number];
    } catch {
      /* ignore */
    }
    return "bots";
  });
  const [msg, setMsg] = useState<string | null>(null);
  if (!data) return <div className="h-40 animate-pulse rounded-xl bg-panel" />;

  return (
    <div>
      <PageTitle kicker={ta("bots_kicker")} title={ta("bots_title")} />
      <div className="mb-5 flex flex-wrap gap-1">
        {TABS.map((t) => (
          <Button key={t} variant={tab === t ? "primary" : "ghost"} onClick={() => {
            setTab(t);
            try {
              sessionStorage.setItem("pc.bots.tab", t);
            } catch {
              /* ignore */
            }
          }}>
            {ta(`tab_${t}`)}
          </Button>
        ))}
      </div>
      {msg ? <p className="mb-3 text-sm text-primary">{msg}</p> : null}
      {tab === "bots" ? <BotsTab data={data} reload={reload} flash={setMsg} /> : null}
      {tab === "accounts" ? <AccountsTab data={data} reload={reload} flash={setMsg} /> : null}
      {tab === "pay" || tab === "cour" || tab === "sup" ? (
        <RoutingTab data={data} tab={tab} reload={reload} flash={setMsg} />
      ) : null}
      {tab === "ntf" ? (
        <div className="panel space-y-2 rounded-xl p-4 text-sm text-muted">
          <p>{ta("ntf_auto_1")}</p>
          <p>{ta("ntf_auto_2")}</p>
          <p>{ta("ntf_auto_3")}</p>
        </div>
      ) : null}
    </div>
  );
}

function BotsTab({
  data,
  reload,
  flash,
}: {
  data: BotsPayload;
  reload: () => void;
  flash: (s: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button className="mb-4" onClick={() => setOpen(true)}>
        {ta("connect_bot")}
      </Button>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {data.bots.map((b) => (
          <BotCard key={String(b.id)} bot={b} reload={reload} flash={flash} />
        ))}
      </div>
      <h2 className="mt-8 text-lg">{ta("personal_bots")}</h2>
      {(data.personal ?? []).length ? (
        data.personal.map((p) => (
          <p key={String(p.id)} className="panel mt-2 rounded-lg px-4 py-3 text-sm">
            @{String(p.username)} · <Badge value={String(p.status)} /> · {String(p.token_fingerprint)}
          </p>
        ))
      ) : (
        <p className="mt-2 text-sm text-muted">{ta("empty")}</p>
      )}
      {open ? (
        <ConnectBotModal
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            reload();
          }}
          flash={flash}
        />
      ) : null}
    </div>
  );
}

function BotCard({
  bot,
  reload,
  flash,
}: {
  bot: Record<string, unknown>;
  reload: () => void;
  flash: (s: string | null) => void;
}) {
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const id = String(bot.id);
  const online = String(bot.status) === "ONLINE";
  return (
    <div className="panel space-y-2 rounded-xl p-4">
      <p className="font-mono text-xs text-cyan">{purposeLabel(String(bot.kind))}</p>
      <p className="text-lg">{String(bot.title ?? bot.username ?? "—")}</p>
      <p className="text-sm text-muted">@{String(bot.username ?? "—")}</p>
      <p className="text-xs text-muted">Telegram ID: {String(bot.telegram_id ?? "—")}</p>
      <Badge value={online ? "ONLINE" : String(bot.status)} />
      <p className="text-xs text-muted">{bot.token_set ? ta("token_set") : ta("token_sim")}</p>
      <p className="text-xs text-muted">
        {ta("last_check")}: {fmt(bot.last_check_at)} · {ta("last_update")}: {fmt(bot.last_update_at)}
      </p>
      {bot.last_error ? (
        <p className="text-xs text-danger">
          {ta("last_error")}: {String(bot.last_error)}
        </p>
      ) : null}
      {token ? (
        <p className="break-all font-mono text-[11px] text-cyan">
          {token}{" "}
          <button type="button" className="text-muted" onClick={() => setToken(null)}>
            {ta("hide_secret")}
          </button>
        </p>
      ) : (
        <p className="font-mono text-xs text-faint">••••••••••••••••••</p>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <Button
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await adminReconnectBot({ data: { id } });
            setBusy(false);
            flash("ok" in r && r.ok === false ? String((r as { error?: string }).error ?? ta("error")) : ta("reconnect"));
            reload();
          }}
        >
          {ta("reconnect")}
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            const r = await adminCheckBot({ data: { id } });
            setBusy(false);
            flash("ok" in r && r.ok === false ? String((r as { error?: string }).error ?? ta("error")) : ta("bot_works"));
            reload();
          }}
        >
          {ta("check_now")}
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            await adminToggleBot({ data: { id, enabled: !online } });
            reload();
          }}
        >
          {online ? ta("disable") : ta("activate")}
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            const r = await adminRevealBotToken({ data: { id } });
            if (r.ok) setToken(r.token);
            else flash(r.error);
          }}
        >
          {ta("reveal")}
        </Button>
        <Button
          variant="danger"
          onClick={async () => {
            if (!confirm(ta("confirm_delete_bot"))) return;
            await adminDeleteBot({ data: { id } });
            reload();
          }}
        >
          {ta("delete")}
        </Button>
      </div>
    </div>
  );
}

function ConnectBotModal({
  onClose,
  onSaved,
  flash,
}: {
  onClose: () => void;
  onSaved: () => void;
  flash: (s: string | null) => void;
}) {
  const [title, setTitle] = useState("");
  const [purpose, setPurpose] = useState<BotPurpose>("main");
  const [token, setToken] = useState("");
  const [info, setInfo] = useState<{ username: string; title: string; telegramId: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-bg/70 p-4 sm:items-center">
      <div className="panel w-full max-w-lg space-y-3 rounded-xl p-5">
        <div className="flex justify-between">
          <h2 className="text-lg">{ta("connect_bot")}</h2>
          <Button variant="ghost" onClick={onClose}>
            {ta("close")}
          </Button>
        </div>
        <Field label={ta("bot_name")} value={title} onChange={setTitle} />
        <label className="block text-xs text-muted">
          {ta("bot_purpose")}
          <div className="mt-2 grid gap-2">
            {BOT_PURPOSES.map((p) => (
              <label key={p} className="flex min-h-11 items-center gap-2 text-sm text-fg">
                <input type="radio" name="purpose" checked={purpose === p} onChange={() => setPurpose(p)} />
                {purposeLabel(p)}
              </label>
            ))}
          </div>
        </label>
        <Field label={ta("bot_token")} value={token} onChange={setToken} />
        {err ? <p className="text-sm text-danger">{err}</p> : null}
        {info ? (
          <div className="rounded-md border border-border bg-raised p-3 text-sm">
            <p className="text-primary">{ta("bot_ok")}</p>
            <p>@{info.username}</p>
            <p>
              {ta("bot_name")}: {info.title}
            </p>
            <p>Telegram ID: {info.telegramId}</p>
            <p className="text-primary">{ta("bot_works")}</p>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="cyan"
            disabled={busy || !token.trim()}
            onClick={async () => {
              setBusy(true);
              setErr(null);
              const r = await adminVerifyBotToken({ data: { token } });
              setBusy(false);
              if (!r.ok) {
                setInfo(null);
                setErr(r.error);
                return;
              }
              setInfo({ username: r.username, title: r.title, telegramId: r.telegramId });
              if (!title) setTitle(r.title);
            }}
          >
            {ta("check_connection")}
          </Button>
          <Button
            disabled={busy || !info}
            onClick={async () => {
              setBusy(true);
              const r = await adminSaveBot({ data: { title: title || info!.title, purpose, token } });
              setBusy(false);
              if (!("ok" in r) || r.ok !== true) {
                setErr("error" in r ? String((r as { error?: string }).error) : ta("error"));
                return;
              }
              flash(`${ta("bot_ok")} @${r.username}`);
              onSaved();
            }}
          >
            {ta("save_bot")}
          </Button>
        </div>
      </div>
    </div>
  );
}

function AccountsTab({
  data,
  reload,
  flash,
}: {
  data: BotsPayload;
  reload: () => void;
  flash: (s: string | null) => void;
}) {
  const [modal, setModal] = useState(false);
  return (
    <div>
      <Button className="mb-4" onClick={() => setModal(true)}>
        {ta("connect_account")}
      </Button>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-panel text-xs text-muted">
            <tr>
              {[ta("col_id"), ta("col_name"), ta("col_username"), "Telegram ID", ta("col_purpose"), ta("col_status"), ta("last_seen"), ta("col_connected"), ""].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.accounts.map((a) => (
              <tr key={String(a.id)} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-[11px]">{String(a.id).slice(-8)}</td>
                <td className="px-3 py-2">{String(a.display_name ?? "—")}</td>
                <td className="px-3 py-2">@{String(a.username ?? "—")}</td>
                <td className="px-3 py-2 font-mono text-xs">{String(a.telegram_id ?? "—")}</td>
                <td className="px-3 py-2">
                  <select
                    className="min-h-11 rounded-md border border-border bg-bg px-2"
                    value={String(a.purpose)}
                    onChange={async (e) => {
                      await adminAccountPurpose({ data: { id: String(a.id), purpose: e.target.value as AccountPurpose } });
                      reload();
                    }}
                  >
                    {ACC_PURPOSES.map((p) => (
                      <option key={p} value={p}>
                        {purposeLabel(p)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <Badge value={String(a.status)} />
                </td>
                <td className="px-3 py-2 text-xs text-muted">{fmt(a.last_activity_at)}</td>
                <td className="px-3 py-2">{a.session_set ? ta("st_connected") : "—"}</td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        await adminCheckAccount({ data: { id: String(a.id) } });
                        reload();
                      }}
                    >
                      {ta("check_now")}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        await adminAccountStatus({
                          data: { id: String(a.id), status: String(a.status) === "DISABLED" ? "CONNECTED" : "DISABLED" },
                        });
                        reload();
                      }}
                    >
                      {String(a.status) === "DISABLED" ? ta("activate") : ta("disable")}
                    </Button>
                    <Button
                      variant="danger"
                      onClick={async () => {
                        if (!confirm(ta("confirm_delete_bot"))) return;
                        await adminDeleteAccount({ data: { id: String(a.id) } });
                        reload();
                      }}
                    >
                      {ta("delete")}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.accounts.length ? <p className="mt-3 text-sm text-muted">{ta("empty")}</p> : null}
      {modal ? (
        <ConnectAccountModal
          onClose={() => setModal(false)}
          onSaved={() => {
            setModal(false);
            reload();
            flash(ta("account_ok"));
          }}
        />
      ) : null}
    </div>
  );
}

function ConnectAccountModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [purpose, setPurpose] = useState<AccountPurpose>("payment");
  const [mode, setMode] = useState<"qr" | "phone">("qr");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [status, setStatus] = useState("PENDING");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [twoFa, setTwoFa] = useState("");
  const [demo, setDemo] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== "qr") return;
    let cancelled = false;
    adminStartQr({ data: { purpose } }).then((r) => {
      if (cancelled) return;
      setSessionId(r.id);
      setQr(r.qrPayload);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, purpose]);

  useEffect(() => {
    if (!sessionId || mode !== "qr" || status === "CONNECTED") return;
    const t = setInterval(() => {
      adminPollAuth({ data: { id: sessionId } }).then((r) => {
        setStatus(r.status);
        if (r.status === "CONNECTED") onSaved();
      });
    }, 2000);
    return () => clearInterval(t);
  }, [sessionId, mode, status, onSaved]);

  const qrSrc = qr
    ? `https://api.qrserver.com/v1/create-qr-code/?size=240x240&color=00ff66&bgcolor=050807&data=${encodeURIComponent(qr)}`
    : null;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-bg/70 p-4 sm:items-center">
      <div className="panel w-full max-w-lg space-y-4 rounded-xl p-5">
        <div className="flex justify-between">
          <h2 className="text-lg">{ta("qr_title")}</h2>
          <Button variant="ghost" onClick={onClose}>
            {ta("close")}
          </Button>
        </div>
        <label className="block text-xs text-muted">
          {ta("bot_purpose")}
          <select
            className="mt-1 min-h-11 w-full rounded-md border border-border bg-bg px-2 text-sm"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value as AccountPurpose)}
          >
            {ACC_PURPOSES.map((p) => (
              <option key={p} value={p}>
                {purposeLabel(p)}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <Button variant={mode === "qr" ? "primary" : "ghost"} onClick={() => setMode("qr")}>
            QR
          </Button>
          <Button variant={mode === "phone" ? "primary" : "ghost"} onClick={() => setMode("phone")}>
            {ta("phone_login")}
          </Button>
        </div>
        {mode === "qr" ? (
          <div className="space-y-3 text-center">
            {qrSrc ? (
              <img src={qrSrc} alt="QR" className="mx-auto size-52 rounded-lg border border-border bg-bg p-2" />
            ) : (
              <div className="mx-auto size-52 animate-pulse rounded-lg bg-raised" />
            )}
            <p className="text-sm text-muted">{ta("qr_hint")}</p>
            <p className="text-cyan">{status === "CONNECTED" ? ta("qr_ok") : ta("qr_wait")}</p>
            <Button
              disabled={!sessionId}
              onClick={async () => {
                if (!sessionId) return;
                const r = await adminConfirmQr({ data: { id: sessionId } });
                if (r.ok) onSaved();
                else setErr(r.error);
              }}
            >
              {ta("qr_confirm")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Field label={ta("phone")} value={phone} onChange={setPhone} />
            <Button
              onClick={async () => {
                const r = await adminStartPhone({ data: { phone, purpose } });
                if (!r.ok) {
                  setErr(r.error);
                  return;
                }
                setSessionId(r.id);
                setDemo(r.demoCode);
                setErr(null);
              }}
            >
              {ta("send_code")}
            </Button>
            {demo ? (
              <>
                <p className="text-sm text-muted">{ta("code_sent")}</p>
                <p className="font-mono text-2xl tracking-[0.4em] text-primary">{demo}</p>
                <Field label={ta("enter_code")} value={code} onChange={setCode} />
                <Field label={ta("enter_2fa")} value={twoFa} onChange={setTwoFa} />
                <Button
                  disabled={!sessionId}
                  onClick={async () => {
                    if (!sessionId) return;
                    const r = await adminVerifyPhone({ data: { id: sessionId, code, twoFa } });
                    if (r.ok) onSaved();
                    else setErr(r.error);
                  }}
                >
                  {ta("confirm")}
                </Button>
                <Button
                  variant="ghost"
                  disabled={!sessionId}
                  onClick={async () => {
                    if (!sessionId) return;
                    const r = await adminVerifyPhone({ data: { id: sessionId, code } });
                    if (r.ok) onSaved();
                    else setErr(r.error);
                  }}
                >
                  {ta("skip_2fa")}
                </Button>
              </>
            ) : null}
          </div>
        )}
        {err ? <p className="text-sm text-danger">{err}</p> : null}
      </div>
    </div>
  );
}

function RoutingTab({
  data,
  tab,
  reload,
  flash,
}: {
  data: BotsPayload;
  tab: "pay" | "cour" | "sup";
  reload: () => void;
  flash: (s: string | null) => void;
}) {
  const [routing, setRouting] = useState<TelegramRouting>(data.routing);
  useEffect(() => setRouting(data.routing), [data.routing]);
  async function apply(patch: Partial<TelegramRouting>, ok: string) {
    const r = await adminSaveRouting({ data: patch });
    setRouting(r.routing);
    flash(ok);
    reload();
  }
  const accounts = data.accounts.filter((a) => String(a.status) === "CONNECTED");
  const bots = data.bots;
  if (tab === "pay") {
    return (
      <div className="panel max-w-xl space-y-3 rounded-xl p-5">
        <h2 className="text-lg">{ta("payment_account")}</h2>
        <p className="text-sm text-muted">{ta("payment_account_hint")}</p>
        <select
          className="min-h-11 w-full rounded-md border border-border bg-bg px-2"
          value={routing.payment_account_id ?? ""}
          onChange={(e) => setRouting({ ...routing, payment_account_id: e.target.value || null })}
        >
          <option value="">{ta("none_selected")}</option>
          {accounts.map((a) => (
            <option key={String(a.id)} value={String(a.id)}>
              @{String(a.username)} · {String(a.display_name)}
            </option>
          ))}
        </select>
        <select
          className="min-h-11 w-full rounded-md border border-border bg-bg px-2"
          value={routing.payment_bot_id ?? ""}
          onChange={(e) => setRouting({ ...routing, payment_bot_id: e.target.value || null })}
        >
          <option value="">
            {ta("purpose_payment")}: {ta("none_selected")}
          </option>
          {bots.map((b) => (
            <option key={String(b.id)} value={String(b.id)}>
              @{String(b.username)} ({purposeLabel(String(b.kind))})
            </option>
          ))}
        </select>
        <Button
          onClick={() =>
            apply({ payment_account_id: routing.payment_account_id, payment_bot_id: routing.payment_bot_id }, ta("payment_account_on"))
          }
        >
          {ta("apply_routing")}
        </Button>
      </div>
    );
  }
  if (tab === "cour") {
    return (
      <div className="panel max-w-xl space-y-3 rounded-xl p-5">
        <h2 className="text-lg">{ta("courier_system")}</h2>
        <label className="block text-xs text-muted">
          {ta("courier_bot")}
          <select
            className="mt-1 min-h-11 w-full rounded-md border border-border bg-bg px-2 text-sm"
            value={routing.courier_bot_id ?? ""}
            onChange={(e) => setRouting({ ...routing, courier_bot_id: e.target.value || null })}
          >
            <option value="">{ta("none_selected")}</option>
            {bots.map((b) => (
              <option key={String(b.id)} value={String(b.id)}>
                @{String(b.username)} ({purposeLabel(String(b.kind))})
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-muted">
          {ta("courier_account")}
          <select
            className="mt-1 min-h-11 w-full rounded-md border border-border bg-bg px-2 text-sm"
            value={routing.courier_account_id ?? ""}
            onChange={(e) => setRouting({ ...routing, courier_account_id: e.target.value || null })}
          >
            <option value="">{ta("none_selected")}</option>
            {accounts.map((a) => (
              <option key={String(a.id)} value={String(a.id)}>
                @{String(a.username)}
              </option>
            ))}
          </select>
        </label>
        <Button onClick={() => apply({ courier_bot_id: routing.courier_bot_id, courier_account_id: routing.courier_account_id }, ta("saved"))}>
          {ta("apply_routing")}
        </Button>
      </div>
    );
  }
  return (
    <div className="panel max-w-xl space-y-3 rounded-xl p-5">
      <h2 className="text-lg">{ta("support_bot")}</h2>
      <select
        className="min-h-11 w-full rounded-md border border-border bg-bg px-2"
        value={routing.support_bot_id ?? ""}
        onChange={(e) => setRouting({ ...routing, support_bot_id: e.target.value || null })}
      >
        <option value="">{ta("none_selected")}</option>
        {bots.map((b) => (
          <option key={String(b.id)} value={String(b.id)}>
            @{String(b.username)}
          </option>
        ))}
      </select>
      <Button onClick={() => apply({ support_bot_id: routing.support_bot_id }, ta("saved"))}>{ta("apply_routing")}</Button>
    </div>
  );
}
