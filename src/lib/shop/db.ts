import { getSql, type Sql } from "@/lib/db";
import type { Row } from "./types";

export type { Sql, Row };
export { asInt, asJson } from "./codec";
export type { Json } from "./types";

export async function sql(): Promise<Sql> {
  return getSql();
}

export async function one<T = Row>(
  client: Sql,
  text: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  const rows = await client.query<T>(text, params);
  return rows[0];
}

export async function many<T = Row>(
  client: Sql,
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  return client.query<T>(text, params);
}

