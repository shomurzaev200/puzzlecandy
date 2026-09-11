import { getRequest } from "@tanstack/react-start/server";

export function readClientIp(): string | null {
  try {
    const req = getRequest();
    if (!req) return null;
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0]?.trim() || null;
    return req.headers.get("x-real-ip");
  } catch {
    return null;
  }
}
