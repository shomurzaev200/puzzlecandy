import { nid } from "./ids";
import { publish } from "./events";
import { sql, type Sql } from "./db";

export async function audit(
  client: Sql | null,
  entry: {
    actorId?: string | null;
    actorType: "ADMIN" | "USER" | "COURIER" | "SYSTEM";
    action: string;
    entity?: string;
    entityId?: string;
    oldValue?: unknown;
    newValue?: unknown;
    ip?: string | null;
  },
): Promise<void> {
  const db = client ?? (await sql());
  await db.query(
    `insert into audit_logs (id, actor_id, actor_type, action, entity, entity_id, old_value, new_value, ip)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)`,
    [
      nid("aud"),
      entry.actorId ?? null,
      entry.actorType,
      entry.action,
      entry.entity ?? null,
      entry.entityId ?? null,
      entry.oldValue == null ? null : JSON.stringify(entry.oldValue),
      entry.newValue == null ? null : JSON.stringify(entry.newValue),
      entry.ip ?? null,
    ],
  );
}

export async function logError(
  client: Sql | null,
  entry: {
    level?: "ERROR" | "WARNING" | "INFO";
    service?: string;
    event?: string;
    message: string;
    requestId?: string;
    context?: unknown;
  },
): Promise<void> {
  const db = client ?? (await sql());
  const id = nid("err");
  await db.query(
    `insert into system_errors (id, level, service, event, message, request_id, context_json)
     values ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [
      id,
      entry.level ?? "ERROR",
      entry.service ?? "shop",
      entry.event ?? null,
      entry.message,
      entry.requestId ?? null,
      entry.context == null ? null : JSON.stringify(entry.context),
    ],
  );
  if ((entry.level ?? "ERROR") === "ERROR") {
    publish({
      type: "SYSTEM_ERROR",
      title: entry.event ?? "System error",
      body: entry.message,
      entityType: "error",
      entityId: id,
    });
  }
}

export async function notify(entry: {
  type: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
}): Promise<void> {
  const db = await sql();
  await db.query(
    `insert into notifications (id, type, title, body, entity_type, entity_id)
     values ($1,$2,$3,$4,$5,$6)`,
    [nid("ntf"), entry.type, entry.title, entry.body ?? null, entry.entityType ?? null, entry.entityId ?? null],
  );
}
