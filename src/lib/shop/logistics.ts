import { asInt, asJson, many, one, sql as getSql } from "./db";
import { nid, nextPublicCode } from "./ids";
import { audit, notify } from "./audit";
import { publish } from "./events";
import { setOrderStatus } from "./commerce";
import type { Json } from "./types";

export async function upsertCourier(opts: {
  telegramId: number;
  username?: string | null;
  firstName?: string | null;
  userId?: string | null;
}) {
  const db = await getSql();
  const existing = await one(db, `select * from couriers where telegram_id=$1`, [opts.telegramId]);
  if (existing) return existing;
  const count = await one<{ n: number }>(db, `select count(*)::int as n from couriers`);
  const status = asInt(count?.n) === 0 ? "ACTIVE" : "PENDING";
  const row = await one(
    db,
    `insert into couriers (id, telegram_id, user_id, username, first_name, status, availability)
     values ($1,$2,$3,$4,$5,$6,'OFFLINE') returning *`,
    [nid("cr"), opts.telegramId, opts.userId ?? null, opts.username ?? null, opts.firstName ?? null, status],
  );
  await audit(null, {
    actorType: "SYSTEM",
    action: "courier.create",
    entity: "courier",
    entityId: String(row?.id ?? ""),
  });
  return row!;
}

export async function setCourierAvailability(courierId: string, availability: "ONLINE" | "OFFLINE") {
  const db = await getSql();
  const c = await one<{ status: string }>(db, `select status from couriers where id=$1`, [courierId]);
  if (!c || c.status !== "ACTIVE") return { ok: false as const, error: "NOT_ACTIVE" };
  await db.query(`update couriers set availability=$2, updated_at=now() where id=$1`, [courierId, availability]);
  return { ok: true as const };
}

export async function assignTask(opts: {
  adminId: string;
  orderId: string;
  courierId: string;
  notes?: string;
  destination?: string;
  priority?: string;
}) {
  const db = await getSql();
  const order = await one<{ id: string; public_code: string; status: string }>(
    db,
    `select id, public_code, status from orders where id=$1`,
    [opts.orderId],
  );
  const courier = await one<{ id: string; status: string }>(db, `select id, status from couriers where id=$1`, [
    opts.courierId,
  ]);
  if (!order || !courier) return { ok: false as const, error: "NOT_FOUND" };
  if (courier.status !== "ACTIVE") return { ok: false as const, error: "COURIER_INACTIVE" };
  const items = await many<{ product_name: string; quantity: number }>(
    db,
    `select product_name, quantity from order_items where order_id=$1`,
    [order.id],
  );
  const summary = items.map((i) => i.product_name).join(", ");
  const qty = items.reduce((s, i) => s + asInt(i.quantity, 1), 0) || 1;
  const id = nid("tsk");
  const code = await nextPublicCode(db, "TSK");
  await db.query(
    `insert into courier_tasks
      (id, public_code, order_id, courier_id, product_summary, quantity, destination, notes, priority, status)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'ASSIGNED')`,
    [
      id,
      code,
      order.id,
      courier.id,
      summary,
      qty,
      opts.destination ?? null,
      opts.notes ?? null,
      opts.priority ?? "NORMAL",
    ],
  );
  await setOrderStatus({
    orderId: order.id,
    to: order.status === "PREPARING" || order.status === "PROCESSING" || order.status === "PAID" ? "COURIER_ASSIGNED" : "COURIER_ASSIGNED",
    actorType: "ADMIN",
    actorId: opts.adminId,
    note: `Assigned ${code}`,
  });
  // Force status even if graph skip: bump via intermediate if needed
  await db.query(`update orders set status='COURIER_ASSIGNED', updated_at=now() where id=$1`, [order.id]);
  await audit(db, {
    actorId: opts.adminId,
    actorType: "ADMIN",
    action: "courier.assign",
    entity: "courier_task",
    entityId: id,
    newValue: { order: order.public_code, courier: courier.id },
  });
  return { ok: true as const, id, code, summary, qty, orderCode: order.public_code };
}

export async function respondTask(opts: { taskId: string; courierId: string; accept: boolean }) {
  const db = await getSql();
  const task = await one<{ id: string; status: string; courier_id: string; order_id: string | null }>(
    db,
    `select id, status, courier_id, order_id from courier_tasks where id=$1`,
    [opts.taskId],
  );
  if (!task || task.courier_id !== opts.courierId) return { ok: false as const, error: "NOT_FOUND" };
  if (task.status !== "ASSIGNED") return { ok: false as const, error: "NOT_ASSIGNED" };
  if (opts.accept) {
    await db.query(
      `update courier_tasks set status='ACCEPTED', accepted_at=now(), updated_at=now() where id=$1`,
      [task.id],
    );
    if (task.order_id) {
      await db.query(`update orders set status='IN_DELIVERY', updated_at=now() where id=$1`, [task.order_id]);
    }
  } else {
    await db.query(`update courier_tasks set status='REJECTED', updated_at=now() where id=$1`, [task.id]);
    await db.query(`update couriers set rejected_count = rejected_count + 1 where id=$1`, [opts.courierId]);
  }
  return { ok: true as const };
}

export async function saveLocation(opts: {
  courierId: string;
  lat: number;
  lng: number;
  taskId?: string | null;
}) {
  const db = await getSql();
  await db.query(
    `insert into courier_locations (id, courier_id, task_id, lat, lng) values ($1,$2,$3,$4,$5)`,
    [nid("loc"), opts.courierId, opts.taskId ?? null, opts.lat, opts.lng],
  );
  await db.query(
    `update couriers set last_lat=$2, last_lng=$3, last_location_at=now(), updated_at=now() where id=$1`,
    [opts.courierId, opts.lat, opts.lng],
  );
  publish({
    type: "COURIER_LOCATION",
    title: "Локация курьера",
    entityType: "courier",
    entityId: opts.courierId,
  });
}

export async function addReportPhoto(opts: {
  courierId: string;
  taskId: string;
  dataUrl: string;
  caption?: string;
}) {
  const db = await getSql();
  const task = await one<{ id: string; courier_id: string }>(
    db,
    `select id, courier_id from courier_tasks where id=$1`,
    [opts.taskId],
  );
  if (!task || task.courier_id !== opts.courierId) return { ok: false as const, error: "NOT_FOUND" };
  const open = await one<{ id: string; photos_json: Json }>(
    db,
    `select id, photos_json from courier_reports where task_id=$1 and status='PENDING_REVIEW' order by created_at desc limit 1`,
    [opts.taskId],
  );
  const photo = { url: opts.dataUrl, caption: opts.caption ?? "", at: new Date().toISOString() };
  if (open) {
    const photos = asJson<unknown[]>(open.photos_json, []);
    photos.push(photo);
    await db.query(`update courier_reports set photos_json=$2::jsonb where id=$1`, [open.id, JSON.stringify(photos)]);
    return { ok: true as const, reportId: open.id };
  }
  const id = nid("rep");
  await db.query(
    `insert into courier_reports (id, task_id, courier_id, photos_json, status)
     values ($1,$2,$3,$4::jsonb,'PENDING_REVIEW')`,
    [id, opts.taskId, opts.courierId, JSON.stringify([photo])],
  );
  return { ok: true as const, reportId: id };
}

export async function submitReport(opts: {
  courierId: string;
  taskId: string;
  comment: string;
  lat?: number | null;
  lng?: number | null;
}) {
  const db = await getSql();
  const task = await one<{ id: string; courier_id: string; order_id: string | null }>(
    db,
    `select id, courier_id, order_id from courier_tasks where id=$1`,
    [opts.taskId],
  );
  if (!task || task.courier_id !== opts.courierId) return { ok: false as const, error: "NOT_FOUND" };
  let report = await one<{ id: string }>(
    db,
    `select id from courier_reports where task_id=$1 order by created_at desc limit 1`,
    [opts.taskId],
  );
  if (!report) {
    const id = nid("rep");
    await db.query(
      `insert into courier_reports (id, task_id, courier_id, comment, lat, lng, status)
       values ($1,$2,$3,$4,$5,$6,'PENDING_REVIEW')`,
      [id, opts.taskId, opts.courierId, opts.comment, opts.lat ?? null, opts.lng ?? null],
    );
    report = { id };
  } else {
    await db.query(
      `update courier_reports set comment=$2, lat=coalesce($3,lat), lng=coalesce($4,lng), status='PENDING_REVIEW' where id=$1`,
      [report.id, opts.comment, opts.lat ?? null, opts.lng ?? null],
    );
  }
  await db.query(`update courier_tasks set status='PENDING_REVIEW', updated_at=now() where id=$1`, [task.id]);
  await notify({
    type: "COURIER_REPORT",
    title: "Отчёт курьера",
    body: opts.comment,
    entityType: "courier_report",
    entityId: report.id,
  });
  publish({
    type: "COURIER_REPORT",
    title: "Ожидается проверка доставки",
    entityType: "courier_report",
    entityId: report.id,
  });
  return { ok: true as const, reportId: report.id };
}

export async function reviewDelivery(opts: {
  adminId: string;
  reportId: string;
  decision: "APPROVED" | "REJECTED";
  reason?: string;
}) {
  const db = await getSql();
  const report = await one<{
    id: string;
    status: string;
    task_id: string;
    courier_id: string;
  }>(db, `select id, status, task_id, courier_id from courier_reports where id=$1`, [opts.reportId]);
  if (!report) return { ok: false as const, error: "NOT_FOUND" };
  if (report.status !== "PENDING_REVIEW") return { ok: true as const, duplicate: true };
  if (opts.decision === "REJECTED" && !opts.reason?.trim()) return { ok: false as const, error: "REASON_REQUIRED" };
  await db.query(
    `update courier_reports set status=$2, reason=$3, reviewed_by=$4, reviewed_at=now() where id=$1 and status='PENDING_REVIEW'`,
    [report.id, opts.decision, opts.reason ?? null, opts.adminId],
  );
  const task = await one<{ order_id: string | null }>(db, `select order_id from courier_tasks where id=$1`, [
    report.task_id,
  ]);
  if (opts.decision === "APPROVED") {
    await db.query(
      `update courier_tasks set status='APPROVED', completed_at=now(), updated_at=now() where id=$1`,
      [report.task_id],
    );
    await db.query(`update couriers set completed_count = completed_count + 1 where id=$1`, [report.courier_id]);
    if (task?.order_id) {
      await db.query(`update orders set status='DELIVERED', updated_at=now() where id=$1`, [task.order_id]);
      await db.query(
        `insert into order_events (id, order_id, from_status, to_status, actor_type, actor_id, note)
         values ($1,$2,'IN_DELIVERY','DELIVERED','ADMIN',$3,'Delivery approved')`,
        [nid("oev"), task.order_id, opts.adminId],
      );
    }
  } else {
    await db.query(`update courier_tasks set status='REJECTED_REVIEW', updated_at=now() where id=$1`, [report.task_id]);
  }
  await audit(db, {
    actorId: opts.adminId,
    actorType: "ADMIN",
    action: opts.decision === "APPROVED" ? "delivery.approve" : "delivery.reject",
    entity: "courier_report",
    entityId: report.id,
    newValue: { reason: opts.reason },
  });
  return { ok: true as const };
}

export async function mapPoints() {
  const db = await getSql();
  return many(
    db,
    `select c.id, c.first_name, c.username, c.availability, c.status, c.last_lat, c.last_lng, c.last_location_at,
            t.id as task_id, t.public_code, t.status as task_status, t.order_id
     from couriers c
     left join courier_tasks t on t.courier_id=c.id and t.status in ('ASSIGNED','ACCEPTED','IN_PROGRESS','PENDING_REVIEW')
     where c.last_lat is not null`,
  );
}
