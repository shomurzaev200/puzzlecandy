import { createFileRoute } from "@tanstack/react-router";
import { subscribe, type ShopEvent } from "@/lib/shop/events";

export const Route = createFileRoute("/api/events")({
  server: {
    handlers: {
      GET: async () => {
        void import("@/lib/shop/telegram-poll").then((m) => m.startBotPolling()).catch(() => undefined);
        let unsub: (() => void) | undefined;
        let ping: ReturnType<typeof setInterval> | undefined;
        const stream = new ReadableStream({
          start(controller) {
            const send = (event: ShopEvent) => {
              try {
                controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
              } catch {
                /* closed */
              }
            };
            unsub = subscribe(send);
            ping = setInterval(() => {
              try {
                controller.enqueue(new TextEncoder().encode(`: ping\n\n`));
              } catch {
                /* closed */
              }
            }, 15000);
          },
          cancel() {
            if (ping) clearInterval(ping);
            unsub?.();
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
