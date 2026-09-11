import { createFileRoute } from "@tanstack/react-router";
import { TelegramPhone } from "@/components/telegram/phone";

export const Route = createFileRoute("/pay")({ component: PayBot });

function PayBot() {
  return <TelegramPhone bot="payment" title="PUZZLECANDY Pay" />;
}
