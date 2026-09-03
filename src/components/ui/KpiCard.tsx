import type { ReactNode } from "react";

export default function KpiCard({
  label,
  value,
  caption,
  icon,
  tone = "blue",
  onClick,
  active = false,
}: {
  label: string;
  value: ReactNode;
  caption?: string;
  icon?: ReactNode;
  tone?: "blue" | "green" | "orange" | "purple" | "pink" | "slate";
  onClick?: () => void;
  active?: boolean;
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-600 dark:bg-blue-950",
    green: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950",
    orange: "bg-orange-50 text-orange-500 dark:bg-orange-950",
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-950",
    pink: "bg-rose-50 text-rose-500 dark:bg-rose-950",
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800",
  };
  const Tag = onClick ? "button" : "section";
  return (
    <Tag
      type={onClick ? "button" : undefined}
      aria-pressed={onClick ? active : undefined}
      onClick={onClick}
      className={`app-card flex min-h-24 w-[min(220px,100%)] items-center gap-3 p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        active ? "border-blue-500 ring-1 ring-blue-500 dark:bg-blue-950/40" : onClick ? "hover:border-blue-300" : ""
      }`}
    >
      {icon && (
        <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg [&_svg]:h-5 [&_svg]:w-5 ${tones[tone]}`}>
          {icon}
        </div>
      )}
      <div className="min-w-0">
        <h2 className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</h2>
        <div className="mt-1 truncate text-xl font-semibold">{value}</div>
        {caption && <p className="mt-1 truncate text-[10px] text-slate-500">{caption}</p>}
      </div>
    </Tag>
  );
}
