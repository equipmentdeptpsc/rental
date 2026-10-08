import { useEffect, useRef, type ReactNode } from "react";

interface Props { title: string; open: boolean; onClose: () => void; children?: ReactNode; busy?: boolean }

export default function DetailsDrawer({ title, open, onClose, children, busy = false }: Props) {
  const panel = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    panel.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) close.current();
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])"));
      if (!focusable.length) { event.preventDefault(); panel.current.focus(); return; }
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); previousFocus.current?.focus(); };
  }, [open, busy]);
  if (!open) return null;
  return <div className="fixed inset-0 z-50" role="presentation">
    <div className="absolute inset-0 bg-slate-950/40" onMouseDown={() => { if (!busy) onClose(); }} />
    <aside ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="absolute inset-y-0 right-0 w-full overflow-y-auto bg-white p-5 shadow-2xl outline-none dark:bg-slate-900 sm:max-w-xl">
      <header className="mb-5 flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-700"><h2 className="font-display text-xl font-semibold">{title}</h2><button type="button" aria-label="Close details" disabled={busy} className="rounded px-2 py-1 text-xl hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 dark:hover:bg-slate-800" onClick={onClose}>×</button></header>
      {children}
    </aside>
  </div>;
}
