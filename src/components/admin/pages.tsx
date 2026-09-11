import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Badge, Field, PageTitle, StatCard, WaitBadge, SavedFilters } from "./shell";
import {
  BulkBar,
  ClaimBadge,
  ContextMenu,
  copyText,
  FavButton,
  PasteCatcher,
  PresenceBadge,
  QuickIcons,
  remember,
  Timeline,
  useRowNav,
} from "./ops-kit";
import { CannedPicker } from "./ops-kit";
import { slaLevel } from "@/lib/shop/ops-client";
import {
  opsBulkPayments,
  opsClaim,
  opsClaims,
  opsListPresence,
  opsNote,
  opsNotes,
  opsPresence,
  opsSnooze,
  opsTag,
  opsTags,
  opsTimeline,
} from "@/lib/shop/fn-ops";
import { formatMoney } from "@/lib/shop/money";
import { asInt, asJson } from "@/lib/shop/codec";
import { pickI18n } from "@/lib/shop/i18n";
import { ta, statusLabel, roleLabel, eventLabel } from "@/lib/shop/admin-i18n";
import {
  adminAssignTask,
  adminAudit,
  adminBulkProducts,
  adminCategories,
  adminCouriers,
  adminCourierStatus,
  adminDashboard,
  adminDeleteProduct,
  adminErrors,
  adminExport,
  adminJobs,
  adminJobApp,
  adminMap,
  adminModerateReview,
  adminNotifications,
  adminOrder,
  adminOrders,
  adminPayment,
  adminPayments,
  adminProducts,
  adminReadNotifications,
  adminReports,
  adminReviewDelivery,
  adminReviewPayment,
  adminReviews,
  adminRoles,
  adminSaveCategory,
  adminSaveJob,
  adminSaveProduct,
  adminSaveSettings,
  adminSearch,
  adminSetOrderStatus,
  adminSetRole,
  adminSettings,
  adminTicket,
  adminTicketReply,
  adminTickets,
  adminTransactions,
  adminUser,
  adminUserAction,
  adminUsers,
} from "@/lib/shop/fn-admin";

function money(v: unknown) {
  return formatMoney(asInt(v));
}

function useLoad<T = unknown>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const reload = () => {
    fn()
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : ta("error")));
  };
  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return { data, err, reload, setData };
}

function queryStatus(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("status");
}

export function DashboardPage() {
  const { data } = useLoad(() => adminDashboard());
  if (!data) return <Skeleton />;
  const pendingPay = asInt(data.pendingPay);
  const pendingDel = asInt(data.pendingDel);
  const pendingTickets = asInt(data.pendingTickets);
  const offlineBots = asInt(data.offlineBots);
  const errorCount = asInt(data.errorCount);
  const attention: Array<{ to: string; text: string; n: number }> = [];
  if (pendingPay > 0) attention.push({ to: "/admin/payments?status=PENDING", text: ta("att_pay", { n: pendingPay }), n: pendingPay });
  if (pendingDel > 0) attention.push({ to: "/admin/couriers", text: ta("att_del", { n: pendingDel }), n: pendingDel });
  if (pendingTickets > 0) attention.push({ to: "/admin/support", text: ta("att_sup", { n: pendingTickets }), n: pendingTickets });
  if (offlineBots > 0) attention.push({ to: "/admin/bots", text: ta("att_bot", { n: offlineBots }), n: offlineBots });
  if (errorCount > 0) attention.push({ to: "/admin/errors", text: ta("att_err", { n: errorCount }), n: errorCount });
  const quick = [
    { to: "/admin/products", label: ta("qa_product") },
    { to: "/admin/payments?status=PENDING", label: ta("qa_payments") },
    { to: "/admin/users", label: ta("qa_balance") },
    { to: "/admin/orders", label: ta("qa_order") },
    { to: "/admin/couriers", label: ta("qa_courier") },
    { to: "/admin/users", label: ta("qa_user") },
    { to: "/admin/notifications", label: ta("qa_alerts") },
  ];
  const bots = (data.bots ?? []) as Array<Record<string, unknown>>;
  const botStatus = (kind: string) => bots.find((b) => String(b.kind) === kind);
  return (
    <div>
      <PageTitle kicker={ta("dash_kicker")} title={ta("dash_title")} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label={ta("kpi_revenue")} value={money(data.revenue)} />
        <StatCard label={ta("kpi_orders")} value={String(data.orders)} />
        <StatCard label={ta("kpi_users")} value={String(data.users)} />
        <StatCard label={ta("kpi_pending_pay")} value={String(pendingPay)} warn={pendingPay > 0} />
        <StatCard label={ta("kpi_pending_del")} value={String(pendingDel)} warn={pendingDel > 0} />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label={ta("kpi_active")} value={String(data.activeUsers)} />
        <StatCard label={ta("kpi_new")} value={String(data.newToday)} />
        <StatCard label={ta("kpi_orders_today")} value={String(data.ordersToday)} />
        <StatCard label={ta("kpi_skus")} value={String(data.products)} />
        <StatCard label={ta("kpi_oos")} value={String(data.out)} warn={asInt(data.out) > 0} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="panel rounded-xl p-4">
          <p className="mb-3 text-sm text-warn">{ta("attention")}</p>
          {attention.length ? (
            <ul className="space-y-2">
              {attention.map((a) => (
                <li key={a.to}>
                  <Link
                    to={a.to.split("?")[0] as "/admin"}
                    className="block min-h-11 rounded-md border border-warn/40 bg-warn/5 px-3 py-2 text-sm hover:border-warn"
                  >
                    {a.text}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{ta("attention_empty")}</p>
          )}
        </div>
        <div className="panel rounded-xl p-4">
          <p className="mb-3 text-sm text-muted">{ta("quick_actions")}</p>
          <div className="flex flex-wrap gap-2">
            {quick.map((q) => {
              const section = q.to.replace("/admin/", "").split("?")[0];
              const dest = section && section !== "admin" ? "/admin/$section" : "/admin";
              return (
                <Link
                  key={q.label}
                  to={dest as "/admin"}
                  params={dest === "/admin/$section" ? { section } : undefined}
                  className="inline-flex min-h-11 items-center rounded-md border border-border px-3 text-sm hover:border-primary hover:text-primary"
                >
                  {q.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="panel h-80 rounded-xl p-4">
          <p className="mb-3 text-sm text-muted">{ta("chart_flow")}</p>
          <ResponsiveContainer width="100%" height="90%">
            <LineChart data={data.series}>
              <CartesianGrid stroke="rgba(0,255,102,0.08)" />
              <XAxis dataKey="d" stroke="#7a9a88" fontSize={11} tickFormatter={(v) => String(v).slice(5)} />
              <YAxis stroke="#7a9a88" fontSize={11} />
              <Tooltip contentStyle={{ background: "#08110d", border: "1px solid #00ff6630", color: "#e8fff0" }} />
              <Line type="monotone" dataKey="revenue" name={ta("chart_sales")} stroke="#00FF66" dot={false} />
              <Line type="monotone" dataKey="deposits" name={ta("chart_deposits")} stroke="#00E5FF" dot={false} />
              <Line type="monotone" dataKey="orders" name={ta("kpi_orders")} stroke="#39FF88" dot={false} />
              <Line type="monotone" dataKey="users" name={ta("chart_users")} stroke="#7C5CFF" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-4">
          <div className="panel rounded-xl p-4">
            <p className="mb-3 text-sm text-muted">{ta("health")}</p>
            <ul className="space-y-1 text-sm">
              <HealthRow label={ta("health_backend")} ok />
              <HealthRow label={ta("health_db")} ok />
              <HealthRow label={ta("health_redis")} ok />
              <HealthRow label={ta("health_worker")} ok />
              <HealthRow label={ta("health_ws")} ok />
              {(["main", "payment", "courier"] as const).map((kind) => {
                const b = botStatus(kind);
                const label = kind === "main" ? ta("health_main") : kind === "payment" ? ta("health_paybot") : ta("health_courbot");
                return <HealthRow key={kind} label={b ? `${label} @${String(b.username ?? kind)}` : label} ok={!b || String(b.status) === "ONLINE"} />;
              })}
            </ul>
          </div>
          <div className="panel rounded-xl p-4">
            <p className="mb-3 text-sm text-muted">{ta("feed")}</p>
            <ul className="space-y-2 text-sm">
              {(data.feed ?? []).map((n) => (
                <li key={String(n.id)} className="border-b border-border/60 pb-2 last:border-0">
                  <p className="text-[11px] text-cyan">
                    {String(n.created_at).slice(11, 16)} · {eventLabel(String(n.type))}
                  </p>
                  <p>{String(n.title)}</p>
                </li>
              ))}
              {!(data.feed ?? []).length ? <p className="text-muted">{ta("empty")}</p> : null}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function HealthRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <li className="flex items-center justify-between">
      <span>{label}</span>
      <span className={ok ? "text-primary" : "text-danger"}>{ok ? ta("health_ok") : ta("health_err")}</span>
    </li>
  );
}

export function UsersPage() {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("ALL");
  const { data, reload } = useLoad(() => adminUsers({ data: { q, status } }), [q, status]);
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      <PageTitle kicker={ta("users_kicker")} title={ta("users_title")} />
      <div className="mb-4 flex flex-wrap gap-2">
        <input className="min-h-11 rounded-md border border-border bg-panel px-3 text-sm" placeholder={ta("search")} value={q} onChange={(e) => setQ(e.target.value)} />
        {["ALL", "ACTIVE", "BLOCKED", "VIP"].map((s) => (
          <Button key={s} variant={status === s ? "primary" : "ghost"} onClick={() => setStatus(s)}>
            {statusLabel(s)}
          </Button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="bg-panel text-xs tracking-wide text-muted">
            <tr>
              {[ta("col_tg"), ta("col_name"), ta("balance"), ta("col_buys"), ta("col_disc"), ta("col_status"), ""].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(data ?? []).map((u) => (
              <tr key={String(u.id)} className="border-t border-border">
                <td className="px-3 py-2 font-mono text-xs">{String(u.telegram_id)}</td>
                <td className="px-3 py-2">{String(u.first_name ?? u.username ?? "—")}</td>
                <td className="px-3 py-2 tabular-nums text-primary">{money(u.balance_cents)}</td>
                <td className="px-3 py-2">{String(u.purchases_count)}</td>
                <td className="px-3 py-2">{String(u.discount_percent)}%</td>
                <td className="px-3 py-2"><Badge value={String(u.status)} /></td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    <Button variant="ghost" onClick={() => setOpen(String(u.id))}>{ta("balance")}</Button>
                    <Button variant="ghost" onClick={() => setOpen(String(u.id))}>{ta("orders")}</Button>
                    <Button variant="ghost" onClick={() => setOpen(String(u.id))}>{ta("write")}</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {open ? <UserDrawer id={open} onClose={() => { setOpen(null); reload(); }} /> : null}
    </div>
  );
}

function UserDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, reload } = useLoad(() => adminUser({ data: { id } }), [id]);
  const [amount, setAmount] = useState("10");
  const [reason, setReason] = useState("ручная корректировка");
  const [tab, setTab] = useState("overview");
  const [message, setMessage] = useState("");
  if (!data?.user) return null;
  const u = data.user;
  async function act(action: "block" | "unblock" | "vip" | "discount" | "deposit" | "withdraw" | "message", extra?: Record<string, unknown>) {
    if (action === "withdraw" && !confirm(ta("confirm_debit", { amount: `$${amount}` }))) return;
    if (action === "deposit" && !confirm(ta("confirm_credit", { amount: `$${amount}` }))) return;
    await adminUserAction({ data: { id, action, amountCents: Math.round(Number(amount) * 100), reason, message, ...extra } as never });
    reload();
  }
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-bg/70">
      <div className="h-full w-full max-w-xl overflow-y-auto border-l border-border bg-surface p-5">
        <div className="flex justify-between">
          <div>
            <p className="font-mono text-xs text-cyan">{String(u.telegram_id)}</p>
            <h2 className="text-xl">{String(u.first_name ?? ta("nav_users"))}</h2>
          </div>
          <Button variant="ghost" onClick={onClose}>{ta("close")}</Button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <StatCard label={ta("balance")} value={money(u.balance_cents)} />
          <StatCard label={ta("col_disc")} value={`${u.discount_percent}%`} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => act("deposit")}>{ta("add_balance")}</Button>
          <Button variant="danger" onClick={() => act("withdraw")}>{ta("debit")}</Button>
          <Button variant="ghost" onClick={() => act("block")}>{ta("block")}</Button>
          <Button variant="ghost" onClick={() => act("unblock")}>{ta("unblock")}</Button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label={ta("amount_usd")} value={amount} onChange={setAmount} />
          <Field label={ta("reason")} value={reason} onChange={setReason} />
        </div>
        <div className="mt-3">
          <Field label={ta("write")} value={message} onChange={setMessage} />
          <Button className="mt-2" variant="ghost" onClick={() => act("message")}>{ta("write")}</Button>
        </div>
        <div className="mt-4 flex gap-2 text-xs">
          {[["overview", ta("overview")], ["orders", ta("orders")], ["ledger", ta("ledger")], ["payments", ta("pay_title")], ["notes", "Заметки"], ["timeline", "Таймлайн"]].map(([k, l]) => (
            <button key={k} className={tab === k ? "text-primary" : "text-muted"} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>
        <div className="mt-3 space-y-2 text-sm">
          {tab === "overview" ? (
            <p className="text-muted">Реферал {String(u.referral_code)} · <Badge value={String(u.status)} /> · {ta("col_buys")} {String(u.purchases_count)}</p>
          ) : null}
          {tab === "orders" ? data.orders.map((o) => <p key={String(o.id)}>{String(o.public_code)} <Badge value={String(o.status)} /> {money(o.total_cents)}</p>) : null}
          {tab === "ledger" ? data.txns.map((t) => <p key={String(t.id)} className="font-mono text-xs">{statusLabel(String(t.type))} {money(t.amount_cents)} → {money(t.balance_after)}</p>) : null}
          {tab === "payments" ? data.pays.map((p) => <p key={String(p.id)}>{String(p.public_code)} <Badge value={String(p.status)} /> {money(p.amount_cents)}</p>) : null}
          {tab === "notes" ? <UserNotes id={id} /> : null}
          {tab === "timeline" ? <UserTimeline id={id} /> : null}
        </div>
        <details className="mt-6 text-xs text-muted">
          <summary>{ta("tech")}</summary>
          <p className="mt-2 font-mono">User ID {String(u.id)}</p>
        </details>
      </div>
    </div>
  );
}

function UserNotes({ id }: { id: string }) {
  const { data, reload } = useLoad(() => opsNotes({ data: { entityType: "user", entityId: id } }), [id]);
  const [body, setBody] = useState("");
  const [tag, setTag] = useState("vip");
  const tags = useLoad(() => opsTags({ data: { entityType: "user", entityId: id } }), [id]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {(tags.data ?? []).map((t) => (
          <button key={String(t.id)} type="button" className="rounded-full border border-border px-2 py-0.5 text-[11px]" onClick={() => void opsTag({ data: { entityType: "user", entityId: id, tag: String(t.tag), remove: true } }).then(tags.reload)}>
            {String(t.tag)} ×
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input className="min-h-11 flex-1 rounded-md border border-border bg-bg px-2 text-sm" value={tag} onChange={(e) => setTag(e.target.value)} />
        <Button variant="ghost" onClick={async () => { await opsTag({ data: { entityType: "user", entityId: id, tag } }); tags.reload(); }}>тег</Button>
      </div>
      {(data ?? []).map((n) => (
        <p key={String(n.id)} className="rounded-md bg-warn/10 px-2 py-1 text-xs">{String(n.body)}</p>
      ))}
      <Field label="Внутренняя заметка" value={body} onChange={setBody} />
      <Button variant="ghost" onClick={async () => { await opsNote({ data: { entityType: "user", entityId: id, body, visibility: "INTERNAL" } }); setBody(""); reload(); }}>Сохранить</Button>
    </div>
  );
}

function UserTimeline({ id }: { id: string }) {
  const { data } = useLoad(() => opsTimeline({ data: { entityType: "user", entityId: id } }), [id]);
  return <Timeline items={(data ?? []).map((e) => ({ at: String(e.at), title: String(e.title), detail: e.detail ? String(e.detail) : undefined, kind: e.kind }))} />;
}

export function ProductsPage() {
  const { data, reload } = useLoad(() => adminProducts());
  const cats = useLoad(() => adminCategories());
  const [edit, setEdit] = useState<Record<string, string>>({ name: "", price: "12", stock: "10", status: "ACTIVE", desc: "" });
  const [openId, setOpenId] = useState<string | undefined>();
  const [extra, setExtra] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <div>
      <PageTitle kicker={ta("products_kicker")} title={ta("products_title")} />
      <div className="panel mb-6 grid gap-3 rounded-xl p-4 sm:grid-cols-2">
        <Field label={ta("field_name")} value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} />
        <Field label={ta("field_price")} value={edit.price} onChange={(v) => setEdit({ ...edit, price: v })} />
        <Field label={ta("field_stock")} value={edit.stock} onChange={(v) => setEdit({ ...edit, stock: v })} />
        <label className="text-xs text-muted">
          {ta("field_category")}
          <select className="mt-1 min-h-11 w-full rounded-md border border-border bg-bg px-2" value={edit.category ?? ""} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>
            <option value="">—</option>
            {(cats.data ?? []).map((c) => <option key={String(c.id)} value={String(c.id)}>{pickI18n(asJson(c.name_i18n, {}), "ru")}</option>)}
          </select>
        </label>
        <button type="button" className="text-left text-xs text-cyan" onClick={() => setExtra(!extra)}>{ta("extra_params")}</button>
        {extra ? <Field label={ta("field_desc")} value={edit.desc ?? ""} onChange={(v) => setEdit({ ...edit, desc: v })} /> : null}
        <Button
          onClick={async () => {
            await adminSaveProduct({
              data: {
                id: openId,
                payload: {
                  name: edit.name,
                  name_i18n: { ru: edit.name, en: edit.name, uz: edit.name },
                  description_i18n: { ru: edit.desc, en: edit.desc, uz: edit.desc },
                  price_cents: Math.round(Number(edit.price) * 100),
                  stock: Number(edit.stock),
                  status: edit.status,
                  published: edit.status !== "HIDDEN",
                  category_id: edit.category || null,
                },
              },
            });
            setOpenId(undefined);
            setEdit({ name: "", price: "12", stock: "10", status: "ACTIVE", desc: "" });
            reload();
          }}
        >
          {openId ? ta("save") : ta("add_product")}
        </Button>
      </div>
      {picked.length ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted">{ta("bulk")}: {picked.length}</span>
          <Button variant="ghost" onClick={async () => { await adminBulkProducts({ data: { ids: picked, action: "hide" } }); setPicked([]); reload(); }}>{ta("bulk_hide")}</Button>
          <Button variant="ghost" onClick={async () => { await adminBulkProducts({ data: { ids: picked, action: "activate" } }); setPicked([]); reload(); }}>{ta("bulk_show")}</Button>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(data ?? []).map((p) => {
          const id = String(p.id);
          const checked = picked.includes(id);
          return (
            <div key={id} className="panel overflow-hidden rounded-xl">
              {p.image_url ? <img src={String(p.image_url)} alt="" className="h-36 w-full object-cover" /> : <div className="h-24 bg-raised" />}
              <div className="space-y-2 p-4">
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" checked={checked} onChange={() => setPicked(checked ? picked.filter((x) => x !== id) : [...picked, id])} />
                  {p.published ? ta("live") : ta("hidden_tag")}
                </label>
                <p className="font-medium">{pickI18n(asJson(p.name_i18n, {}), "ru")}</p>
                <p className="font-mono text-sm text-primary">{money(p.price_cents)} · {ta("stock_n", { n: String(p.stock) })}</p>
                <p className="text-xs"><Badge value={String(p.status)} /></p>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" onClick={() => { setOpenId(id); setEdit({ name: pickI18n(asJson(p.name_i18n, {}), "ru"), price: String(asInt(p.price_cents) / 100), stock: String(p.stock), status: String(p.status), category: String(p.category_id ?? ""), desc: pickI18n(asJson(p.description_i18n, {}), "ru") }); }}>{ta("edit")}</Button>
                  <Button variant="ghost" onClick={async () => { await adminBulkProducts({ data: { ids: [id], action: p.published ? "hide" : "activate" } }); reload(); }}>{p.published ? ta("hide") : ta("show")}</Button>
                  <Button variant="danger" onClick={async () => { if (confirm(ta("confirm_delete_product"))) { await adminDeleteProduct({ data: { id } }); reload(); } }}>{ta("delete")}</Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function CategoriesPage() {
  const { data, reload } = useLoad(() => adminCategories());
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  return (
    <div>
      <PageTitle kicker={ta("cats_kicker")} title={ta("cats_title")} />
      <div className="mb-4 flex flex-wrap gap-2">
        <Field label={ta("field_name")} value={name} onChange={setName} />
        <Field label={ta("field_slug")} value={slug} onChange={setSlug} />
        <Button onClick={async () => { await adminSaveCategory({ data: { name, slug: slug || name.toLowerCase().replace(/\s+/g, "-") } }); setName(""); reload(); }}>{ta("add_category")}</Button>
      </div>
      <ul className="space-y-2">
        {(data ?? []).map((c) => (
          <li key={String(c.id)} className="panel flex items-center justify-between rounded-lg px-4 py-3">
            <span>{pickI18n(asJson(c.name_i18n, {}), "ru")} <span className="text-muted">/{String(c.slug)}</span></span>
            <Button variant="ghost" onClick={async () => { await adminSaveCategory({ data: { id: String(c.id), slug: String(c.slug), name: pickI18n(asJson(c.name_i18n, {}), "ru"), status: c.status === "ACTIVE" ? "HIDDEN" : "ACTIVE" } }); reload(); }}><Badge value={String(c.status)} /></Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function OrdersPage() {
  const [status, setStatus] = useState("ALL");
  const { data, reload } = useLoad(() => adminOrders({ data: { status } }), [status]);
  const [open, setOpen] = useState<string | null>(null);
  const detail = useLoad(() => (open ? adminOrder({ data: { id: open } }) : Promise.resolve(null)), [open]);
  const couriers = useLoad(() => adminCouriers());
  const [courierId, setCourierId] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <div className="lg:grid lg:grid-cols-[1fr_minmax(300px,400px)] lg:gap-4">
      <div>
      <PageTitle kicker={ta("orders_kicker")} title={ta("orders_title")} />
      <div className="mb-3 flex flex-wrap gap-2">
        {["ALL", "PAID", "PROCESSING", "COURIER_ASSIGNED", "IN_DELIVERY", "COMPLETED"].map((s) => (
          <Button key={s} variant={status === s ? "primary" : "ghost"} onClick={() => setStatus(s)}>{statusLabel(s)}</Button>
        ))}
      </div>
      <div className="mb-4">
        <SavedFilters storageKey="pc.filter.orders" current={status} onApply={setStatus} />
      </div>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[700px] text-sm">
          <thead className="bg-panel text-xs text-muted"><tr>{["", ta("col_code"), ta("col_user"), ta("col_product"), ta("col_total"), ta("col_status"), ""].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr></thead>
          <tbody>
            {(data ?? []).map((o) => (
              <tr key={String(o.id)} className="group relative cursor-pointer border-t border-border hover:bg-raised" onClick={() => setOpen(String(o.id))}>
                <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" checked={picked.includes(String(o.id))} onChange={() => setPicked(picked.includes(String(o.id)) ? picked.filter((x) => x !== String(o.id)) : [...picked, String(o.id)])} />
                </td>
                <td className="relative px-3 py-2 font-mono text-xs">
                  {String(o.public_code)}
                  <QuickIcons copyValue={String(o.public_code)} username={o.username ? String(o.username) : null} />
                </td>
                <td className="px-3 py-2">{String(o.first_name ?? o.username)}</td>
                <td className="px-3 py-2">{String(o.product_name ?? "—")}</td>
                <td className="px-3 py-2">{money(o.total_cents)}</td>
                <td className="px-3 py-2"><Badge value={String(o.status)} /></td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    <Button variant="ghost" onClick={() => setOpen(String(o.id))}>{ta("view")}</Button>
                    <Button variant="ghost" onClick={() => setOpen(String(o.id))}>{ta("assign")}</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <BulkBar count={picked.length}>
        <select className="min-h-11 rounded-md border border-border bg-bg px-2" value={courierId} onChange={(e) => setCourierId(e.target.value)}>
          <option value="">{ta("pick_courier")}</option>
          {(couriers.data ?? []).map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.first_name ?? c.username)}</option>)}
        </select>
        <Button onClick={async () => {
          if (!courierId) return;
          for (const id of picked) await adminAssignTask({ data: { orderId: id, courierId } });
          setPicked([]);
          reload();
        }}>Назначить курьера ({picked.length})</Button>
      </BulkBar>
      </div>
      {open && detail.data?.order ? (
        <div className="panel mt-4 space-y-3 rounded-xl p-4">
          <div className="flex justify-between"><h3>{String(detail.data.order.public_code)}</h3><Button variant="ghost" onClick={() => setOpen(null)}>{ta("close")}</Button></div>
          <p className="text-sm text-muted">{ta("col_status")} <Badge value={String(detail.data.order.status)} /></p>
          <div className="flex flex-wrap gap-2">
            {["PROCESSING", "PREPARING", "COURIER_ASSIGNED", "IN_DELIVERY", "DELIVERED", "COMPLETED", "CANCELLED", "REFUNDED"].map((s) => (
              <Button key={s} variant="plain" onClick={async () => {
                if (s === "CANCELLED" && !confirm(ta("confirm_cancel_order"))) return;
                await adminSetOrderStatus({ data: { id: open, status: s } });
                detail.reload();
                reload();
              }}>{statusLabel(s)}</Button>
            ))}
          </div>
          <div className="flex gap-2">
            <select className="min-h-11 rounded-md border border-border bg-bg px-2" value={courierId} onChange={(e) => setCourierId(e.target.value)}>
              <option value="">{ta("pick_courier")}</option>
              {(couriers.data ?? []).map((c) => <option key={String(c.id)} value={String(c.id)}>{String(c.first_name ?? c.username)} ({statusLabel(String(c.status))})</option>)}
            </select>
            <Button onClick={async () => { if (!courierId) return; await adminAssignTask({ data: { orderId: open, courierId } }); detail.reload(); reload(); }}>{ta("assign")}</Button>
          </div>
          <details className="text-xs text-muted">
            <summary>{ta("tech")}</summary>
            <p className="mt-2 font-mono">Order ID {String(detail.data.order.id)} · User {String(detail.data.order.user_id)}</p>
          </details>
        </div>
      ) : (
        <div className="hidden rounded-xl border border-dashed border-border p-6 text-sm text-muted lg:block">
          Выберите заказ — список слева не закроется.
        </div>
      )}
    </div>
  );
}

export function PaymentsPage() {
  const search = useRouterState({ select: (s) => s.location.searchStr });
  const [status, setStatus] = useState(() => queryStatus() || "PENDING");
  useEffect(() => {
    const s = new URLSearchParams(typeof search === "string" ? search.replace(/^\?/, "") : "").get("status");
    if (s) setStatus(s);
  }, [search]);
  const { data, reload } = useLoad(() => adminPayments({ data: { status } }), [status]);
  const [open, setOpen] = useState<string | null>(null);
  const detail = useLoad(() => (open ? adminPayment({ data: { id: open } }) : Promise.resolve(null)), [open]);
  const [reason, setReason] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const claims = useLoad(() => opsClaims({ data: { entityType: "payment" } }), [status]);
  const presence = useLoad(() => opsListPresence({ data: { entityType: "payment", ids: [] } }), [open]);
  const rows = [...(data ?? [])].sort((a, b) => {
    const la = slaLevel(a.created_at);
    const lb = slaLevel(b.created_at);
    const rank = { crit: 0, warn: 1, ok: 2, null: 3 } as Record<string, number>;
    return (rank[String(la)] ?? 3) - (rank[String(lb)] ?? 3);
  });
  const { idx, setIdx } = useRowNav(rows, (row) => setOpen(String(row.id)));
  useEffect(() => {
    if (!open) return;
    void opsPresence({ data: { entityType: "payment", entityId: open } });
    remember({ entity_type: "payment", entity_id: open, label: String(detail.data?.payment?.public_code ?? open), href: "/admin/payments" });
  }, [open, detail.data?.payment?.public_code]);
  async function decide(id: string, decision: "APPROVED" | "REJECTED", why?: string) {
    if (decision === "APPROVED" && !confirm(ta("confirm_approve_pay"))) return;
    const row = rows.find((p) => String(p.id) === id);
    await adminReviewPayment({ data: { id, decision, reason: why } });
    if (decision === "APPROVED" && row) setFlash(ta("pay_ok", { amount: money(row.amount_cents) }));
    reload();
    detail.reload();
  }
  return (
    <div className="lg:grid lg:grid-cols-[1fr_minmax(320px,420px)] lg:gap-4">
      <div>
        <PageTitle kicker={ta("pay_kicker")} title={ta("pay_title")} />
        {flash ? <p className="mb-3 text-sm text-primary">{flash}</p> : null}
        <PasteCatcher
          onFile={(file) => {
            if (!open) return;
            const reader = new FileReader();
            reader.onload = () => toastShot(String(reader.result ?? ""));
            reader.readAsDataURL(file);
          }}
        />
        <div className="mb-3 flex flex-wrap gap-2">{["PENDING", "APPROVED", "REJECTED", "ALL"].map((s) => <Button key={s} variant={status === s ? "primary" : "ghost"} onClick={() => setStatus(s)}>{statusLabel(s)}</Button>)}</div>
        <div className="mb-4">
          <SavedFilters storageKey="pc.filter.payments" current={status} onApply={setStatus} />
        </div>
        <BulkBar count={picked.length}>
          <Button
            onClick={async () => {
              if (!confirm(ta("confirm_approve_pay"))) return;
              await opsBulkPayments({ data: { ids: picked, decision: "APPROVED" } });
              setPicked([]);
              reload();
            }}
          >
            Подтвердить выбранные ({picked.length})
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              await opsBulkPayments({ data: { ids: picked, decision: "REJECTED", reason: reason || "bulk" } });
              setPicked([]);
              reload();
            }}
          >
            Отклонить выбранные
          </Button>
        </BulkBar>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-panel text-xs text-muted">
              <tr>
                <th className="px-3 py-2"><input type="checkbox" checked={picked.length > 0 && picked.length === rows.length} onChange={() => setPicked(picked.length === rows.length ? [] : rows.map((r) => String(r.id)))} /></th>
                <th className="px-3 py-2">{ta("col_code")}</th>
                <th className="px-3 py-2">{ta("col_user")}</th>
                <th className="px-3 py-2">{ta("col_amount")}</th>
                <th className="px-3 py-2">{ta("col_status")}</th>
                <th className="px-3 py-2">SLA</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => {
                const id = String(p.id);
                const claim = (claims.data ?? []).find((c) => String(c.entity_id) === id);
                const viewer = (presence.data ?? []).find((c) => String(c.entity_id) === id);
                return (
                  <tr
                    key={id}
                    className={cn(
                      "group relative cursor-pointer border-t border-border hover:bg-raised",
                      idx === i && "bg-raised",
                      slaLevel(p.created_at) === "crit" && String(p.status) === "PENDING" && "bg-danger/5",
                    )}
                    onClick={() => {
                      setOpen(id);
                      setIdx(i);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setMenu({ x: e.clientX, y: e.clientY, id });
                    }}
                  >
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={picked.includes(id)} onChange={() => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])} />
                    </td>
                    <td className="relative px-3 py-2 font-mono text-xs">
                      {String(p.public_code)}
                      <QuickIcons
                        onApprove={String(p.status) === "PENDING" ? () => void decide(id, "APPROVED") : undefined}
                        onReject={String(p.status) === "PENDING" ? () => { setOpen(id); } : undefined}
                        copyValue={String(p.public_code)}
                        username={p.username ? String(p.username) : null}
                        telegram={p.telegram_id as number | undefined}
                      />
                    </td>
                    <td className="px-3 py-2">{String(p.username ?? p.first_name)}</td>
                    <td className="px-3 py-2 text-primary">{money(p.amount_cents)}</td>
                    <td className="px-3 py-2">
                      <Badge value={String(p.status)} />
                      {claim ? <div><ClaimBadge name={String(claim.admin_name)} /></div> : null}
                      {viewer ? <div><PresenceBadge name={String(viewer.admin_name)} /></div> : null}
                    </td>
                    <td className="px-3 py-2">{String(p.status) === "PENDING" ? <WaitBadge since={p.created_at} /> : null}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {open && detail.data?.payment ? (
        <div className="panel mt-4 space-y-3 rounded-xl p-4 lg:mt-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-mono text-xs text-cyan">{String(detail.data.payment.public_code)}</p>
              <h3 className="text-lg">{money(detail.data.payment.amount_cents)}</h3>
            </div>
            <div className="flex gap-1">
              <FavButton entity_type="payment" entity_id={open} label={String(detail.data.payment.public_code)} href="/admin/payments" />
              <Button variant="ghost" onClick={() => setOpen(null)}>{ta("close")}</Button>
            </div>
          </div>
          {detail.data.payment.screenshot_url ? <img src={String(detail.data.payment.screenshot_url)} alt="" className="max-h-80 rounded-lg" /> : <p className="text-muted">{ta("no_shot")}</p>}
          <p>{money(detail.data.payment.amount_cents)} · Telegram ID {String(detail.data.payment.telegram_id)} · <Badge value={String(detail.data.payment.status)} /></p>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={async () => { await opsClaim({ data: { entityType: "payment", entityId: open } }); claims.reload(); }}>Взять в работу</Button>
            <Button variant="plain" onClick={async () => { await opsSnooze({ data: { entityType: "payment", entityId: open, until: new Date(Date.now() + 15 * 60000).toISOString(), note: "15 мин" } }); }}>Snooze 15 мин</Button>
          </div>
          {String(detail.data.payment.status) === "PENDING" ? (
            <>
              <Field label={ta("reject_reason")} value={reason} onChange={setReason} />
              <div className="flex gap-2">
                <Button onClick={() => void decide(open, "APPROVED")}>{ta("confirm")}</Button>
                <Button variant="danger" onClick={() => { if (!reason.trim()) return; void decide(open, "REJECTED", reason); }}>{ta("reject")}</Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">{ta("pay_locked")}</p>
          )}
        </div>
      ) : (
        <div className="hidden rounded-xl border border-dashed border-border p-6 text-sm text-muted lg:block">
          Выберите платёж — детали откроются справа, список останется слева.
        </div>
      )}
      {menu ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            { label: "Открыть", onClick: () => setOpen(menu.id) },
            { label: "Одобрить", onClick: () => void decide(menu.id, "APPROVED") },
            { label: "Отклонить", onClick: () => setOpen(menu.id), danger: true },
            { label: "Скопировать ID", onClick: () => copyText(menu.id, "ID") },
            { label: "Экспорт JSON", onClick: () => copyText(JSON.stringify(rows.find((r) => String(r.id) === menu.id) ?? {}), "JSON") },
          ]}
        />
      ) : null}
    </div>
  );
}

function toastShot(_dataUrl: string) {
  /* screenshot lands on the open payment; attach is handled by the cash-desk bot */
}

export function TransactionsPage() {
  const { data } = useLoad(() => adminTransactions({ data: {} }));
  return (
    <div>
      <PageTitle kicker={ta("tx_kicker")} title={ta("tx_title")} actions={<ExportBar kind="transactions" />} />
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-panel text-xs text-muted"><tr>{[ta("col_type"), ta("col_user"), ta("col_amount"), ta("col_before"), ta("col_after"), ta("reason")].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr></thead>
          <tbody>
            {(data ?? []).map((t) => (
              <tr key={String(t.id)} className="border-t border-border">
                <td className="px-3 py-2">{statusLabel(String(t.type))}</td>
                <td className="px-3 py-2">{String(t.username)}</td>
                <td className="px-3 py-2 text-primary">{money(t.amount_cents)}</td>
                <td className="px-3 py-2">{money(t.balance_before)}</td>
                <td className="px-3 py-2">{money(t.balance_after)}</td>
                <td className="px-3 py-2 text-muted">{String(t.reason ?? "")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CouriersPage() {
  const { data, reload } = useLoad(() => adminCouriers());
  const reports = useLoad(() => adminReports());
  const [reason, setReason] = useState("Недостаточно доказательств");
  return (
    <div>
      <PageTitle kicker={ta("cour_kicker")} title={ta("cour_title")} />
      <div className="grid gap-3 sm:grid-cols-2">
        {(data ?? []).map((c) => (
          <div key={String(c.id)} className="panel rounded-xl p-4">
            <p className="font-medium">{String(c.first_name ?? c.username)}</p>
            <p className="text-xs text-muted"><Badge value={String(c.status)} /> / {statusLabel(String(c.availability))} · {String(c.completed_count)}</p>
            <div className="mt-2 flex gap-2">
              <Button variant="ghost" onClick={async () => { await adminCourierStatus({ data: { id: String(c.id), status: "ACTIVE" } }); reload(); }}>{ta("activate")}</Button>
              <Button variant="ghost" onClick={async () => { await adminCourierStatus({ data: { id: String(c.id), status: "SUSPENDED" } }); reload(); }}>{ta("suspend")}</Button>
            </div>
          </div>
        ))}
      </div>
      <h2 className="mt-8 text-lg">{ta("delivery_review")}</h2>
      <div className="mt-3 space-y-3">
        {(reports.data ?? []).map((r) => (
          <div key={String(r.id)} className="panel rounded-xl p-4">
            <p className="font-mono text-xs">{String(r.public_code)} · <Badge value={String(r.status)} /></p>
            <p className="text-sm">{String(r.comment ?? "")}</p>
            <p className="text-xs text-muted">{r.lat != null ? `${r.lat}, ${r.lng}` : ta("no_pin")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(asJson<Array<{ url: string }>>(r.photos_json, [])).map((p, i) => <img key={i} src={p.url} alt="" className="h-24 rounded-md" />)}
            </div>
            {String(r.status) === "PENDING_REVIEW" ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={async () => { await adminReviewDelivery({ data: { id: String(r.id), decision: "APPROVED" } }); reports.reload(); }}>{ta("confirm")}</Button>
                <Field label={ta("reject_reason")} value={reason} onChange={setReason} />
                <Button variant="danger" onClick={async () => { await adminReviewDelivery({ data: { id: String(r.id), decision: "REJECTED", reason } }); reports.reload(); }}>{ta("reject")}</Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MapPage() {
  const { data } = useLoad(() => adminMap());
  const pins = (data ?? []).filter((p) => p.last_lat != null && p.last_lng != null);
  const lats = pins.map((p) => Number(p.last_lat));
  const lngs = pins.map((p) => Number(p.last_lng));
  const minLng = lngs.length ? Math.min(...lngs) - 0.08 : 69.1;
  const maxLng = lngs.length ? Math.max(...lngs) + 0.08 : 69.4;
  const minLat = lats.length ? Math.min(...lats) - 0.05 : 41.2;
  const maxLat = lats.length ? Math.max(...lats) + 0.05 : 41.4;
  const [open, setOpen] = useState<string | null>(null);
  const selected = pins.find((p) => String(p.id) === open);
  return (
    <div>
      <PageTitle kicker={ta("map_kicker")} title={ta("map_title")} />
      <div className="panel relative h-[520px] overflow-hidden rounded-xl">
        <iframe title="map" className="h-full w-full grayscale-[30%] contrast-125" src={`https://www.openstreetmap.org/export/embed.html?bbox=${minLng},${minLat},${maxLng},${maxLat}&layer=mapnik`} />
        {pins.map((p) => {
          const left = ((Number(p.last_lng) - minLng) / (maxLng - minLng)) * 100;
          const top = ((maxLat - Number(p.last_lat)) / (maxLat - minLat)) * 100;
          return (
            <button key={String(p.id)} type="button" className="absolute z-10 -translate-x-1/2 -translate-y-full rounded-full border border-primary bg-bg px-2 py-1 text-[11px] text-primary glow-sm" style={{ left: `${left}%`, top: `${top}%` }} onClick={() => setOpen(String(p.id))}>
              {String(p.first_name ?? p.username ?? ta("nav_couriers"))}
            </button>
          );
        })}
        <div className="absolute bottom-3 left-3 right-3 max-h-40 space-y-1 overflow-y-auto rounded-md bg-bg/90 p-3 text-xs">
          {selected ? (
            <p>{String(selected.first_name ?? selected.username)} · {statusLabel(String(selected.availability))} · {String(selected.last_lat)}, {String(selected.last_lng)} · {statusLabel(String(selected.task_status ?? "IDLE"))}</p>
          ) : null}
          {pins.map((p) => (
            <button key={String(p.id)} type="button" className="block text-left text-cyan" onClick={() => setOpen(String(p.id))}>
              {String(p.first_name ?? p.username)} · {statusLabel(String(p.availability))}
            </button>
          ))}
          {!pins.length ? <p className="text-muted">{ta("no_pins")}</p> : null}
        </div>
      </div>
    </div>
  );
}

export function ReviewsPage() {
  const { data, reload } = useLoad(() => adminReviews());
  return (
    <div>
      <PageTitle kicker={ta("rev_kicker")} title={ta("rev_title")} />
      <ul className="space-y-2">
        {(data ?? []).map((r) => (
          <li key={String(r.id)} className="panel flex flex-wrap items-center justify-between gap-2 rounded-xl p-4">
            <div>
              <p>★{String(r.rating)} {String(r.first_name)} — {String(r.body ?? "")}</p>
              <p className="text-xs"><Badge value={String(r.status)} /></p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={async () => { await adminModerateReview({ data: { id: String(r.id), status: "VISIBLE" } }); reload(); }}>{ta("show")}</Button>
              <Button variant="ghost" onClick={async () => { await adminModerateReview({ data: { id: String(r.id), status: "HIDDEN" } }); reload(); }}>{ta("hide")}</Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SupportPage() {
  const { data, reload } = useLoad(() => adminTickets());
  const [open, setOpen] = useState<string | null>(null);
  const detail = useLoad(() => (open ? adminTicket({ data: { id: open } }) : Promise.resolve(null)), [open]);
  const [body, setBody] = useState("");
  return (
    <div>
      <PageTitle kicker={ta("sup_kicker")} title={ta("sup_title")} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ul className="space-y-2">
          {(data ?? []).map((t) => (
            <li key={String(t.id)}>
              <button type="button" className="panel w-full rounded-xl p-4 text-left" onClick={() => setOpen(String(t.id))}>
                <p className="font-mono text-xs">{String(t.public_code)}</p>
                <p>{String(t.subject)}</p>
                <p className="text-xs text-muted"><Badge value={String(t.status)} /> · {String(t.first_name)}</p>
                {String(t.status) !== "CLOSED" ? <WaitBadge since={t.updated_at ?? t.created_at} /> : null}
              </button>
            </li>
          ))}
        </ul>
        {detail.data?.ticket ? (
          <div className="panel rounded-xl p-4">
            <h3>{String(detail.data.ticket.public_code)}</h3>
            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto text-sm">
              {detail.data.messages.map((m) => (
                <p key={String(m.id)} className={m.sender_type === "ADMIN" ? "text-cyan" : ""}>{m.sender_type === "ADMIN" ? "Оператор" : "Клиент"}: {String(m.body)}</p>
              ))}
            </div>
            <textarea className="mt-3 min-h-24 w-full rounded-md border border-border bg-bg p-2 text-sm" value={body} onChange={(e) => setBody(e.target.value)} />
            <div className="mt-2 flex gap-2">
              <CannedPicker onPick={setBody} vars={{ name: String(detail.data.ticket.first_name ?? ""), order_id: String(detail.data.ticket.public_code) }} />
              <Button onClick={async () => { const id = String(detail.data?.ticket?.id ?? ""); await adminTicketReply({ data: { id, body } }); setBody(""); detail.reload(); reload(); }}>{ta("reply")}</Button>
              <Button variant="ghost" onClick={async () => { const id = String(detail.data?.ticket?.id ?? ""); await adminTicketReply({ data: { id, body: body || "Закрыто", status: "CLOSED" } }); reload(); }}>{ta("close_ticket")}</Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function JobsPage() {
  const { data, reload } = useLoad(() => adminJobs());
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [payment, setPayment] = useState("$10 / задача");
  return (
    <div>
      <PageTitle kicker={ta("jobs_kicker")} title={ta("jobs_title")} />
      <div className="panel mb-4 grid gap-2 rounded-xl p-4">
        <Field label={ta("field_title")} value={title} onChange={setTitle} />
        <Field label={ta("field_desc")} value={description} onChange={setDescription} />
        <Field label={ta("field_pay")} value={payment} onChange={setPayment} />
        <Button onClick={async () => { await adminSaveJob({ data: { title, description, payment } }); setTitle(""); reload(); }}>{ta("create_job")}</Button>
      </div>
      {(data?.jobs ?? []).map((j) => <p key={String(j.id)} className="panel mb-2 rounded-lg px-4 py-3">{pickI18n(asJson(j.title_i18n, {}), "ru")} · <Badge value={String(j.status)} /></p>)}
      <h2 className="mt-6 text-lg">{ta("applications")}</h2>
      {(data?.apps ?? []).map((a) => (
        <div key={String(a.id)} className="panel mt-2 flex items-center justify-between rounded-lg px-4 py-3">
          <p>{String(a.first_name)} → {pickI18n(asJson(a.title_i18n, {}), "ru")} · <Badge value={String(a.status)} /></p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={async () => { await adminJobApp({ data: { id: String(a.id), status: "APPROVED" } }); reload(); }}>{ta("confirm")}</Button>
            <Button variant="ghost" onClick={async () => { await adminJobApp({ data: { id: String(a.id), status: "REJECTED" } }); reload(); }}>{ta("reject")}</Button>
          </div>
        </div>
      ))}
    </div>
  );
}

export function AnalyticsPage() {
  const { data } = useLoad(() => adminDashboard());
  if (!data) return <Skeleton />;
  return (
    <div>
      <PageTitle kicker={ta("an_kicker")} title={ta("an_title")} />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label={ta("kpi_revenue")} value={money(data.revenue)} />
        <StatCard label={ta("aov")} value={money(data.orders ? Math.round(data.revenue / data.orders) : 0)} />
        <StatCard label={ta("kpi_users")} value={String(data.users)} />
      </div>
      <div className="panel mt-6 h-80 rounded-xl p-4">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.series}>
            <CartesianGrid stroke="rgba(0,255,102,0.08)" />
            <XAxis dataKey="d" stroke="#7a9a88" fontSize={11} tickFormatter={(v) => String(v).slice(5)} />
            <YAxis stroke="#7a9a88" fontSize={11} />
            <Tooltip contentStyle={{ background: "#08110d", border: "1px solid #00ff6630", color: "#e8fff0" }} />
            <Line type="monotone" dataKey="revenue" name={ta("chart_sales")} stroke="#00FF66" dot={false} />
            <Line type="monotone" dataKey="orders" name={ta("kpi_orders")} stroke="#00E5FF" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function NotificationsPage() {
  const { data, reload } = useLoad(() => adminNotifications());
  return (
    <div>
      <PageTitle kicker={ta("ntf_kicker")} title={ta("ntf_title")} actions={<Button variant="ghost" onClick={async () => { await adminReadNotifications(); reload(); }}>{ta("mark_read")}</Button>} />
      <ul className="space-y-2">
        {(data ?? []).map((n) => (
          <li key={String(n.id)} className="panel rounded-lg px-4 py-3">
            <p className="text-xs text-cyan">{eventLabel(String(n.type))}</p>
            <p>{String(n.title)}</p>
            <p className="text-sm text-muted">{String(n.body ?? "")}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SettingsPage() {
  const { data, reload } = useLoad(() => adminSettings());
  const [min, setMin] = useState("5");
  const [max, setMax] = useState("1000");
  const [ref, setRef] = useState("5");
  const [uzs, setUzs] = useState("12750");
  const [rules, setRules] = useState("");
  const [info, setInfo] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  useEffect(() => {
    if (!data) return;
    setMin(String((asInt(data.settings.min_deposit_cents) || 500) / 100));
    setMax(String((asInt(data.settings.max_deposit_cents) || 100000) / 100));
    setRef(String(data.settings.referral_percent ?? 5));
    const uz = (data.rates as Array<{ code: string; rate_to_usd: string }>).find((r) => r.code === "UZS");
    if (uz) setUzs(String(uz.rate_to_usd));
    const rulesPage = (data.pages as Array<{ slug: string; body_i18n: unknown }>).find((p) => p.slug === "rules");
    const infoPage = (data.pages as Array<{ slug: string; body_i18n: unknown }>).find((p) => p.slug === "info");
    if (rulesPage) setRules(pickI18n(asJson(rulesPage.body_i18n, {}), "ru"));
    if (infoPage) setInfo(pickI18n(asJson(infoPage.body_i18n, {}), "ru"));
  }, [data]);
  async function persist() {
    setSaveState("saving");
    await adminSaveSettings({
      data: {
        settings: { min_deposit_cents: Math.round(Number(min) * 100), max_deposit_cents: Math.round(Number(max) * 100), referral_percent: Number(ref) },
        pages: [
          { slug: "rules", title: "Правила", body: rules },
          { slug: "info", title: "Инфо", body: info },
        ],
        rates: [{ code: "UZS", rate: Number(uzs) }, { code: "USD", rate: 1 }, { code: "EUR", rate: 0.92 }],
      },
    });
    setSaveState("saved");
    reload();
  }
  useEffect(() => {
    if (!data) return;
    const t = setTimeout(() => { void persist(); }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rules, info]);
  if (!data) return <Skeleton />;
  return (
    <div>
      <PageTitle kicker={ta("set_kicker")} title={ta("set_title")} actions={<span className="text-xs text-muted">{saveState === "saving" ? ta("saving") : saveState === "saved" ? ta("saved") : ""}</span>} />
      <div className="panel grid gap-3 rounded-xl p-4 sm:grid-cols-3">
        <Field label={ta("min_dep")} value={min} onChange={setMin} />
        <Field label={ta("max_dep")} value={max} onChange={setMax} />
        <Field label={ta("referral")} value={ref} onChange={setRef} />
        <Field label={ta("uzs_rate")} value={uzs} onChange={setUzs} />
      </div>
      <div className="panel mt-6 space-y-3 rounded-xl p-4">
        <div>
          <p className="text-sm">{ta("set_telegram")}</p>
          <p className="text-sm text-muted">{ta("set_telegram_copy")}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {([
            ["bots", ta("tab_bots")],
            ["accounts", ta("tab_accounts")],
            ["pay", ta("tab_pay")],
            ["cour", ta("tab_cour")],
            ["sup", ta("tab_sup")],
            ["ntf", ta("tab_ntf")],
          ] as const).map(([tab, label]) => (
            <Link
              key={tab}
              to="/admin/$section"
              params={{ section: "bots" }}
              className="flex min-h-11 items-center rounded-md border border-border px-3 text-sm hover:border-cyan hover:text-cyan"
              onClick={() => {
                try {
                  sessionStorage.setItem("pc.bots.tab", tab);
                } catch {
                  /* ignore */
                }
              }}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>
      <label className="mt-4 block text-xs text-muted">{ta("rules")}
        <textarea className="mt-1 min-h-32 w-full rounded-md border border-border bg-panel p-3 text-sm" value={rules} onChange={(e) => setRules(e.target.value)} />
      </label>
      <label className="mt-4 block text-xs text-muted">{ta("info")}
        <textarea className="mt-1 min-h-32 w-full rounded-md border border-border bg-panel p-3 text-sm" value={info} onChange={(e) => setInfo(e.target.value)} />
      </label>
      <Button className="mt-4" onClick={() => void persist()}>{ta("save_settings")}</Button>
      <SoundSettingsPanel />
    </div>
  );
}

function SoundSettingsPanel() {
  const [enabled, setEnabled] = useState(true);
  const [volume, setVolume] = useState(40);
  const [theme, setTheme] = useState("dark");
  useEffect(() => {
    try {
      setEnabled(localStorage.getItem("pc.sound") !== "off");
      setVolume(Number(localStorage.getItem("pc.sound.volume") ?? "40"));
      setTheme(localStorage.getItem("pc.theme") || "dark");
    } catch {
      /* ignore */
    }
  }, []);
  return (
    <div className="panel mt-6 space-y-3 rounded-xl p-4">
      <p className="text-sm">Настройки → Уведомления → Звуковые сигналы</p>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => {
            setEnabled(e.target.checked);
            try {
              localStorage.setItem("pc.sound", e.target.checked ? "on" : "off");
            } catch {
              /* ignore */
            }
          }}
        />
        Звук новых заказов / платежей
      </label>
      <label className="block text-xs text-muted">
        Громкость
        <input
          type="range"
          className="mt-2 w-full"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => {
            const v = Number(e.target.value);
            setVolume(v);
            try {
              localStorage.setItem("pc.sound.volume", String(v));
            } catch {
              /* ignore */
            }
          }}
        />
      </label>
      <label className="block text-xs text-muted">
        Тема
        <select
          className="mt-1 min-h-11 w-full rounded-md border border-border bg-bg px-2"
          value={theme}
          onChange={(e) => {
            setTheme(e.target.value);
            try {
              localStorage.setItem("pc.theme", e.target.value);
              document.documentElement.dataset.theme = e.target.value;
            } catch {
              /* ignore */
            }
          }}
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </label>
    </div>
  );
}

export function AuditPage() {
  const { data } = useLoad(() => adminAudit());
  return (
    <div>
      <PageTitle kicker={ta("aud_kicker")} title={ta("aud_title")} />
      <ul className="space-y-1 font-mono text-xs">
        {(data ?? []).map((a) => (
          <li key={String(a.id)} className="rounded-md border border-border px-3 py-2">
            {String(a.created_at)} · {String(a.actor_type)} · {String(a.action)} · {String(a.entity)} {String(a.entity_id ?? "")}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ErrorsPage() {
  const { data } = useLoad(() => adminErrors());
  return (
    <div>
      <PageTitle kicker={ta("err_kicker")} title={ta("err_title")} />
      <ul className="space-y-2">
        {(data ?? []).map((e) => (
          <li key={String(e.id)} className="panel rounded-lg p-3">
            <p className="text-xs text-warn">{String(e.level)} · {String(e.service)}</p>
            <p>{String(e.message)}</p>
          </li>
        ))}
        {!(data ?? []).length ? <p className="text-muted">{ta("no_errors")}</p> : null}
      </ul>
    </div>
  );
}

export function RolesPage() {
  const { data, reload } = useLoad(() => adminRoles());
  return (
    <div>
      <PageTitle kicker={ta("roles_kicker")} title={ta("roles_title")} />
      {(data?.admins ?? []).map((a) => (
        <div key={String(a.id)} className="panel mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg px-4 py-3">
          <p>{String(a.email ?? a.name)}</p>
          <select className="min-h-11 rounded-md border border-border bg-bg px-2" defaultValue={String(a.role)} onChange={async (e) => { await adminSetRole({ data: { id: String(a.id), role: e.target.value as never } }); reload(); }}>
            {["SUPER_ADMIN", "ADMIN", "MODERATOR", "SUPPORT", "FINANCE", "COURIER_MANAGER"].map((r) => (
              <option key={r} value={r}>{roleLabel(r)}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}

export function SearchPage({ q }: { q: string }) {
  const { data } = useLoad(() => adminSearch({ data: { q } }), [q]);
  if (!data) return <Skeleton />;
  return (
    <div>
      <PageTitle kicker={ta("search_kicker")} title={q || ta("search")} />
      {(["users", "orders", "products", "payments", "tickets", "couriers"] as const).map((k) => (
        <div key={k} className="mb-4">
          <h2 className="mb-2 text-sm uppercase tracking-widest text-muted">{
            k === "users" ? ta("nav_users") :
            k === "orders" ? ta("nav_orders") :
            k === "products" ? ta("nav_products") :
            k === "payments" ? ta("nav_payments") :
            k === "tickets" ? ta("nav_support") :
            ta("nav_couriers")
          }</h2>
          <ul className="space-y-1 text-sm">
            {(data[k] as Array<Record<string, unknown>>).map((row) => (
              <li key={String(row.id)} className="panel rounded-md px-3 py-2">{String(row.username ?? row.public_code ?? row.slug ?? row.id)} {row.status ? <Badge value={String(row.status)} /> : null}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ExportBar({ kind }: { kind: string }) {
  return (
    <div className="flex gap-2">
      <Button variant="ghost" onClick={async () => { const f = await adminExport({ data: { kind, format: "csv" } }); download(f.filename, f.body, f.mime); }}>{ta("export")} CSV</Button>
      <Button variant="ghost" onClick={async () => { const f = await adminExport({ data: { kind, format: "json" } }); download(f.filename, f.body, f.mime); }}>JSON</Button>
    </div>
  );
}

function download(name: string, body: string, mime: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function Skeleton() {
  return <div className="h-40 animate-pulse rounded-xl bg-panel" />;
}
