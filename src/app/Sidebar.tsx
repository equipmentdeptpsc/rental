import {
  BarChart3,
  Building2,
  ClipboardList,
  FileText,
  FolderKanban,
  LayoutDashboard,
  Settings,
  Truck,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { NavLink } from "react-router-dom";

import { useApplicationDependenciesCompatibility } from "@/app/composition";
import {
  getVisibleNavigation,
  type NavigationItem,
} from "@/app/navigation/navigationConfig";
import { useAuth } from "@/features/auth/AuthContext";
import OrganizationBrand from "@/shared/branding/OrganizationBrand";

const icons: Readonly<Record<NavigationItem["icon"], LucideIcon>> = {
  dashboard: LayoutDashboard,
  equipment: Truck,
  assignments: ClipboardList,
  rentals: ClipboardList,
  maintenance: Wrench,
  operators: Users,
  projects: FolderKanban,
  dailyLogs: ClipboardList,
  customers: Building2,
  billing: FileText,
  reports: BarChart3,
  settings: Settings,
};

export default function Sidebar({
  collapsed,
  mobileOpen,
  onToggle,
  onNavigate,
}: {
  collapsed: boolean;
  mobileOpen: boolean;
  onToggle(): void;
  onNavigate(): void;
}) {
  const { user } = useAuth();
  const { authentication } = useApplicationDependenciesCompatibility();
  const menuGroups = getVisibleNavigation(
    user,
    authentication.authorizationService,
  );

  return (
    <aside className={`${mobileOpen ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900 text-white transition-transform md:static md:translate-x-0 ${collapsed ? "md:w-16" : "md:w-64"}`}>
      <div className="border-b border-slate-700 p-4">
        <button aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} aria-expanded={!collapsed} onClick={onToggle} className="hidden rounded p-2 hover:bg-slate-800 md:block">☰</button>
        {!collapsed && <div className="mt-3"><OrganizationBrand compact inverse /></div>}
      </div>
      <nav className="flex-1 overflow-y-auto p-4">
        {menuGroups.map((group) => (
          <div key={group.title} className="mb-6">
            {!collapsed && <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">{group.title}</p>}
            {group.items.map((item) => {
              const Icon = icons[item.icon];
              return (
                <NavLink
                  className={({ isActive }) => `mb-1 flex items-center gap-3 rounded-lg px-4 py-3 transition ${isActive ? "bg-blue-600 text-white" : "text-slate-300 hover:bg-slate-800"}`}
                  end={item.path === "/"}
                  key={item.label}
                  onClick={onNavigate}
                  title={item.label}
                  to={item.path}
                >
                  <Icon size={20} />
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
