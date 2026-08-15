import type { ReactNode } from "react";
import StatusBadge, { type StatusBadgeTone } from "@/components/ui/StatusBadge";

export default function EntityDetailLayout({
  title,
  subtitle,
  status,
  statusTone = "neutral",
  actions,
  kpis,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  status?: ReactNode;
  statusTone?: StatusBadgeTone;
  actions?: ReactNode;
  kpis?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="app-page">
      <header className="app-card p-5 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Record</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
            {status && (
              <div className="mt-3">
                <StatusBadge tone={statusTone}>{status}</StatusBadge>
              </div>
            )}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
        {kpis && <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{kpis}</div>}
      </header>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">{children}</div>
    </div>
  );
}

export function EntityDetailMain({ children }: { children: ReactNode }) {
  return <div className="space-y-6">{children}</div>;
}

export function EntityDetailAside({ children }: { children: ReactNode }) {
  return <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">{children}</aside>;
}

export function EntitySection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="app-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
