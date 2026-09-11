import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/components/admin/pages";

export const Route = createFileRoute("/admin/")({ component: DashboardPage });
