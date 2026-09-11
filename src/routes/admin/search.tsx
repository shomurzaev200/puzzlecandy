import { createFileRoute } from "@tanstack/react-router";
import { SearchPage } from "@/components/admin/pages";

type Search = { q?: string };

export const Route = createFileRoute("/admin/search")({
  validateSearch: (s: Record<string, unknown>): Search => ({ q: typeof s.q === "string" ? s.q : "" }),
  component: function AdminSearch() {
    const { q } = Route.useSearch();
    return <SearchPage q={q ?? ""} />;
  },
});
