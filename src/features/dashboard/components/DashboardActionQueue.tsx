import { Link } from "react-router-dom";
import type { Permission } from "@/features/auth/domain/permission";
import type { DashboardActionItem } from "../services/dashboardActionQueue";

export default function DashboardActionQueue({ items, hasPermission }: { items: readonly DashboardActionItem[]; hasPermission: (permission: Permission) => boolean }) {
  const visibleItems = items.filter((item) => hasPermission(item.permission));
  if (!visibleItems.length) {
    return (
      <section className="dashboard-panel p-4">
        <h2 className="dashboard-panel-title">Action Queue</h2>
        <p className="mt-3 text-sm text-slate-500">No operational exceptions require attention right now.</p>
      </section>
    );
  }

  const tones = {
    warning: "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30",
    danger: "border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30",
    info: "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30",
  };

  return (
    <section className="dashboard-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="dashboard-panel-title">Action Queue</h2>
        <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">{visibleItems.length}</span>
      </div>
      <ul className="space-y-2">
        {visibleItems.map((item) => (
          <li key={item.id}>
            <Link
              to={item.href}
              className={`flex items-start justify-between gap-3 rounded-lg border p-3 transition hover:opacity-90 ${tones[item.tone]}`}
            >
              <div className="min-w-0">
                <strong className="block text-sm">{item.title}</strong>
                <span className="mt-1 block text-xs text-slate-600 dark:text-slate-300">{item.description}</span>
              </div>
              {item.count !== undefined && (
                <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-xs font-bold dark:bg-slate-900/60">
                  {item.count}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
