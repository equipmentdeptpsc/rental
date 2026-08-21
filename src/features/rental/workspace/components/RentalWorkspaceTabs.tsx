import TabBadge from "@/components/ui/TabBadge";
import {
  WORKSPACE_TABS,
  type WorkspaceTab,
} from "../types";
import type { WorkspaceTabBadge } from "../presentation/workspaceTabBadges";

const closedAllowed = new Set<WorkspaceTab>(["overview", "timeline", "deur", "invoices", "collections"]);
export default function RentalWorkspaceTabs({
  activeTab,
  onChange,
  readOnly = false,
  badges = {},
}: {
  activeTab: WorkspaceTab;
  onChange(tab: WorkspaceTab): void;
  readOnly?: boolean;
  badges?: Partial<Record<WorkspaceTab, WorkspaceTabBadge>>;
}) {
  return (
    <div className="app-card overflow-hidden">
      <div className="flex overflow-x-auto" role="tablist" aria-label="Rental workspace sections">
        {WORKSPACE_TABS.map((tab) => {
          const badge = badges[tab.id];
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              disabled={tab.disabled || (readOnly && !closedAllowed.has(tab.id))}
              onClick={() => (!readOnly || closedAllowed.has(tab.id)) && onChange(tab.id)}
              className={`flex items-center border-b-2 px-5 py-4 text-sm font-medium whitespace-nowrap transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                selected
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-slate-600 hover:text-blue-600 dark:text-slate-300"
              }`}
            >
              {tab.label}
              {badge && <TabBadge count={badge.count} tone={badge.tone} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
