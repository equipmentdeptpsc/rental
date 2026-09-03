import type { ReactNode } from "react";

export default function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-12 text-center dark:border-slate-600 dark:bg-slate-900/40 ${className ?? ""}`}>
      {icon && <span className="mb-2 text-slate-400 dark:text-slate-500">{icon}</span>}
      <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
      {description && <p className="mt-2 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
