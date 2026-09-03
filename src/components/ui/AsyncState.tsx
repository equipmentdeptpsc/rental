import type { ReactNode } from "react";
import Button from "./Button";
import EmptyState from "./EmptyState";

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return <div className="app-card flex items-center justify-center p-8 text-sm text-slate-600 dark:text-slate-300" role="status" aria-live="polite">{label}</div>;
}

export function ErrorState({ title = "Unable to load data", message, onRetry }: { title?: string; message: string; onRetry?: () => void }) {
  return <div className="app-card border border-red-200 p-6 dark:border-red-900/60" role="alert"><h2 className="font-semibold text-red-800 dark:text-red-200">{title}</h2><p className="mt-1 text-sm text-red-700 dark:text-red-300">{message}</p>{onRetry && <Button className="mt-4" variant="secondary" onClick={onRetry}>Retry</Button>}</div>;
}

export function EmptyDataState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return <EmptyState title={title} description={description} action={action} />;
}
