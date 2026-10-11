import { CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { Permission } from "@/features/auth/domain/permission";
import type { DashboardActionItem } from "../services/dashboardActionQueue";

export default function DashboardActionQueue({ items, hasPermission, title = "Attention / Action Required" }: { items: readonly DashboardActionItem[]; hasPermission: (permission: Permission) => boolean; title?: string }) {
  const visibleItems = items.filter((item) => hasPermission(item.permission));
  if (!visibleItems.length) {
    return (
      <section className="dashboard-panel border-l-[3px] border-l-emerald-500 bg-emerald-50 p-3 dark:border-emerald-700 dark:bg-emerald-950/30">
        <div className="flex items-center gap-3"><CheckCircle2 aria-hidden="true" className="shrink-0 text-emerald-600 dark:text-emerald-400" size={18} /><h2 className="dashboard-panel-title text-emerald-900 dark:text-emerald-100">{title}</h2><p className="text-xs font-medium text-emerald-800 dark:text-emerald-200">All clear — no operational exceptions right now.</p></div>
      </section>
    );
  }

  const tones = {
    warning: "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30",
    danger: "border-rose-200 bg-rose-50 dark:border-rose-800 dark:bg-rose-950/30",
    info: "border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30",
  };

  return (
    <section className="dashboard-panel p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="dashboard-panel-title">{title}</h2>
        <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[10px] font-bold text-white">{visibleItems.length}</span>
      </div>
      <ul className="flex flex-wrap gap-2">
        {visibleItems.map((item) => (
          <li key={item.id} className="min-w-[11rem] flex-1">
            <Link
              to={item.href}
              className={`flex h-full items-center justify-between gap-2 rounded-lg border px-3 py-2 transition hover:opacity-90 ${tones[item.tone]}`}
            >
              <div className="min-w-0">
                <strong className="block text-xs leading-tight">{item.title}</strong>
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
