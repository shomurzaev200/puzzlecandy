import { createFileRoute } from "@tanstack/react-router";
import type { ComponentType } from "react";
import {
  AnalyticsPage,
  AuditPage,
  CategoriesPage,
  CouriersPage,
  ErrorsPage,
  JobsPage,
  MapPage,
  NotificationsPage,
  OrdersPage,
  PaymentsPage,
  ProductsPage,
  ReviewsPage,
  RolesPage,
  SettingsPage,
  SupportPage,
  TransactionsPage,
  UsersPage,
} from "@/components/admin/pages";
import { BotsPage } from "@/components/admin/bots-panel";
import {
  ApprovalsPage,
  CannedPage,
  ChangelogPage,
  HelpPage,
  HandoverPage,
  KeysPage,
  OpsHubPage,
  PayoutsPage,
  PromoPage,
  RefundsPage,
  RulesPageOps,
  SegmentsPage,
  WebhooksPage,
} from "@/components/admin/ops-pages";
import { ta } from "@/lib/shop/admin-i18n";

export const Route = createFileRoute("/admin/$section")({ component: Section });

const PAGES: Record<string, ComponentType> = {
  users: UsersPage,
  products: ProductsPage,
  categories: CategoriesPage,
  orders: OrdersPage,
  payments: PaymentsPage,
  transactions: TransactionsPage,
  couriers: CouriersPage,
  map: MapPage,
  reviews: ReviewsPage,
  support: SupportPage,
  jobs: JobsPage,
  analytics: AnalyticsPage,
  notifications: NotificationsPage,
  bots: BotsPage,
  settings: SettingsPage,
  audit: AuditPage,
  errors: ErrorsPage,
  roles: RolesPage,
  ops: OpsHubPage,
  refunds: RefundsPage,
  promo: PromoPage,
  payouts: PayoutsPage,
  segments: SegmentsPage,
  rules: RulesPageOps,
  approvals: ApprovalsPage,
  handover: HandoverPage,
  keys: KeysPage,
  webhooks: WebhooksPage,
  canned: CannedPage,
  changelog: ChangelogPage,
  help: HelpPage,
};

function Section() {
  const { section } = Route.useParams();
  const Page = PAGES[section];
  if (!Page) {
    return (
      <div className="panel rounded-xl p-8">
        <h1 className="text-xl">{ta("unknown_module")}</h1>
        <p className="text-muted">{section}</p>
      </div>
    );
  }
  return <Page />;
}
