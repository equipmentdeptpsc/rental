import { useEffect, useState, type ReactNode } from "react";
import { Bell, ChevronDown, Menu, Moon, Sun } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/AuthContext";
import { getSystemRoleDefinition } from "@/features/auth/domain/rolePermissions";

const pageMeta: Readonly<Record<string, { title: string; subtitle: string }>> = {
  "/dashboard": { title: "Dashboard", subtitle: "Overview of operations, equipment, rentals, DEUR, and billing." },
  "/": { title: "Dashboard", subtitle: "Overview of operations, equipment, rentals, DEUR, and billing." },
  "/equipment": { title: "Equipment", subtitle: "Manage fleet records, availability, and lifecycle status." },
  "/assignments": { title: "Assignments", subtitle: "Coordinate equipment, operators, and projects." },
  "/rentals": { title: "Rentals", subtitle: "Manage rental operations and lifecycle progress." },
  "/billing": { title: "Billing", subtitle: "Review billable activity, invoices, and collections." },
};

export default function Header({ onMenu, search }: { onMenu(): void; search?: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [dark, setDark] = useState(() => localStorage.getItem("ui-theme") === "dark");
  const meta = pageMeta[pathname] ?? { title: pathname.split("/").filter(Boolean)[0]?.replace(/-/g, " ") ?? "Workspace", subtitle: "Equipment Rental Management System" };

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("ui-theme", dark ? "dark" : "light");
  }, [dark]);

  function signOut() { navigate("/login", { replace: true }); logout(); }
  const role = user ? getSystemRoleDefinition(user.systemRoles[0])?.displayName ?? user.role : "";

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95 sm:px-5">
      <div className="flex items-center gap-4">
        <button aria-label="Toggle navigation" className="rounded-md p-2 text-slate-700 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:text-slate-200 dark:hover:bg-slate-800" onClick={onMenu}><Menu size={22} /></button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold capitalize tracking-tight sm:text-2xl">{meta.title}</h1>
          <p className="hidden truncate text-xs text-slate-500 sm:block">{meta.subtitle}</p>
        </div>
        {search && <div className="hidden w-full max-w-sm xl:block">{search}</div>}
        <button aria-label={dark ? "Use light mode" : "Use dark mode"} aria-pressed={dark} className="flex items-center gap-2 rounded-md px-2 py-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-800" onClick={() => setDark((value) => !value)}>
          {dark ? <Sun size={18} /> : <Moon size={18} />}<span className="hidden xl:inline">Dark mode</span>
          <span className={`relative h-5 w-9 rounded-full transition ${dark ? "bg-blue-600" : "bg-slate-300"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${dark ? "left-[18px]" : "left-0.5"}`} /></span>
        </button>
        <button aria-label="Notifications" className="rounded-md p-2 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"><Bell size={18} /></button>
        {user && <div className="flex items-center rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
          <div className="flex items-center gap-2 p-1.5 text-left">
            <span className="sr-only">{user.displayName} ({role})</span>
            <span aria-hidden="true" className="grid h-9 w-9 place-items-center rounded-full bg-slate-800 text-sm font-semibold text-white">{user.displayName.slice(0, 2).toUpperCase()}</span>
            <span aria-hidden="true" className="hidden min-w-0 xl:block"><span className="block max-w-36 truncate text-xs font-semibold">{user.displayName}</span><span className="block max-w-36 truncate text-[11px] text-slate-500">{role}</span></span>
          </div>
          <button className="rounded p-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" onClick={signOut} title="Sign out"><span className="sr-only">Sign Out</span><ChevronDown aria-hidden="true" size={15} /></button>
        </div>}
      </div>
      {search && <div className="mt-3 xl:hidden">{search}</div>}
    </header>
  );
}
