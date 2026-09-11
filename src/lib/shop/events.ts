import type { ShopEventType } from "./types";

export type ShopEvent = {
  type: ShopEventType;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
  at: string;
};

type Listener = (event: ShopEvent) => void;

const g = globalThis as typeof globalThis & {
  __puzzlcandyListeners__?: Set<Listener>;
};

function listeners(): Set<Listener> {
  g.__puzzlcandyListeners__ ??= new Set();
  return g.__puzzlcandyListeners__;
}

export function publish(event: Omit<ShopEvent, "at"> & { at?: string }): ShopEvent {
  const full: ShopEvent = { ...event, at: event.at ?? new Date().toISOString() };
  for (const listener of listeners()) {
    try {
      listener(full);
    } catch {
      /* isolated listener failure */
    }
  }
  return full;
}

export function subscribe(listener: Listener): () => void {
  listeners().add(listener);
  return () => listeners().delete(listener);
}
