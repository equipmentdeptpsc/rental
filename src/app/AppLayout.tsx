import { useEffect, useState } from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";
import { Outlet } from "react-router-dom";

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("ui-sidebar-collapsed") === "true");
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { localStorage.setItem("ui-sidebar-collapsed", String(collapsed)); }, [collapsed]);
  useEffect(() => {
    const close = (event: KeyboardEvent) => event.key === "Escape" && setMobileOpen(false);
    window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close);
  }, []);
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden">

      <Header onMenu={() => setMobileOpen(true)} />

      <div className="flex flex-1 min-w-0">

        {mobileOpen && <button aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={() => setMobileOpen(false)} />}
        <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onToggle={() => setCollapsed(value => !value)} onNavigate={() => setMobileOpen(false)} />

        <main className="min-w-0 flex-1 overflow-auto bg-slate-100">

          <div className="p-4 sm:p-6 lg:p-8">

            <Outlet />

          </div>

        </main>

      </div>

    </div>
  );
}
