import { createFileRoute } from "@tanstack/react-router";
import { TelegramPhone } from "@/components/telegram/phone";

export const Route = createFileRoute("/courier")({ component: CourierBot });

function CourierBot() {
  return <TelegramPhone bot="courier" title="PUZZLECANDY Courier" />;
}
