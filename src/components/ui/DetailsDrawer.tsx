import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props { title: string; open: boolean; onClose: () => void; children?: ReactNode; busy?: boolean }

export default function DetailsDrawer({ title, open, onClose, children, busy = false }: Props) {
  const panel = useRef<HTMLElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const close = useRef(onClose);
  const [rendered, setRendered] = useState(open);
  const [entered, setEntered] = useState(false);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    if (open) {
      setRendered(true);
      const frame = window.requestAnimationFrame(() => setEntered(true));
      return () => window.cancelAnimationFrame(frame);
    }
    setEntered(false);
    const timer = window.setTimeout(() => setRendered(false), 220);
    return () => window.clearTimeout(timer);
  }, [open]);
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
  if (!rendered) return null;
  const motion = open ? "transform 220ms ease-out, opacity 220ms ease-out, visibility 0s" : "transform 200ms ease-in, opacity 200ms ease-in, visibility 0s linear 200ms";
  return <div className={`fixed inset-0 z-50 transition-opacity duration-200 motion-reduce:!transition-none ${open ? "opacity-100" : "opacity-0 pointer-events-none"}`} style={{ transitionTimingFunction: open ? "ease-out" : "ease-in" }} role="presentation" aria-hidden={!open}>
    <div className="absolute inset-0 bg-slate-950/40 transition-opacity duration-200 motion-reduce:!transition-none" style={{ opacity: open ? 1 : 0, transitionTimingFunction: open ? "ease-out" : "ease-in" }} onMouseDown={() => { if (open && !busy) close.current(); }} />
    <aside ref={panel} tabIndex={-1} role="dialog" aria-modal={open || undefined} aria-hidden={!open} inert={!open} aria-label={title} style={{ opacity: entered ? 1 : 0, transform: entered ? "translateX(0)" : "translateX(100%)", visibility: rendered ? "visible" : "hidden", transition: motion }} className="absolute inset-y-0 right-0 w-full overflow-y-auto bg-white p-5 shadow-2xl outline-none motion-reduce:!transition-none dark:bg-slate-900 sm:max-w-xl">
      <header className="mb-5 flex items-start justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-700"><h2 className="font-display text-xl font-semibold">{title}</h2><button type="button" aria-label="Close details" disabled={busy} className="rounded px-2 py-1 text-xl hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 dark:hover:bg-slate-800" onClick={onClose}>×</button></header>
      {children}
    </aside>
  </div>;
}
