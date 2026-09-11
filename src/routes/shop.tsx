import { createFileRoute } from "@tanstack/react-router";
import { TelegramPhone } from "@/components/telegram/phone";

export const Route = createFileRoute("/shop")({ component: ShopBot });

function ShopBot() {
  return <TelegramPhone bot="main" title="PUZZLECANDY" />;
}
