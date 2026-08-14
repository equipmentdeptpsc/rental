import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import Header from "./Header";
import Sidebar from "./Sidebar";
import GlobalSearch from "@/components/search/GlobalSearch";
import { organizationBranding } from "@/shared/branding/organizationBranding";

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("ui-sidebar-collapsed") === "true");
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => { localStorage.setItem("ui-sidebar-collapsed", String(collapsed)); }, [collapsed]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, []);

  function toggleNavigation() {
    if (window.matchMedia("(min-width: 768px)").matches) setCollapsed((value) => !value);
    else setMobileOpen((value) => !value);
  }

  return (
    <div className="flex min-h-screen overflow-x-hidden bg-[var(--app-bg)] text-slate-950 dark:text-slate-100">
      {mobileOpen && (
        <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-slate-950/50 md:hidden" onClick={() => setMobileOpen(false)} />
      )}
      <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onToggle={() => setCollapsed((value) => !value)} onNavigate={() => setMobileOpen(false)} />

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <Header onMenu={toggleNavigation} search={<GlobalSearch />} />
        <main className="min-w-0 flex-1 bg-[var(--app-bg)]">
          <div className="mx-auto w-full p-4 sm:p-5 lg:p-6"><Outlet /></div>
        </main>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 bg-white px-5 py-3 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400">
          <span>© {new Date().getFullYear()} {organizationBranding.companyName}. All rights reserved.</span>
          <span>Build {import.meta.env.VITE_APP_VERSION ?? "development"} <span aria-hidden="true">•</span> {import.meta.env.MODE}</span>
        </footer>
      </div>
    </div>
  );
}
