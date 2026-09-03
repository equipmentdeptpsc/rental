import { BarChart3, Building2, ChevronLeft, ChevronRight, ClipboardList, FileText, FolderKanban, LayoutDashboard, Settings, Truck, Users, Wrench, type LucideIcon } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { getVisibleNavigation, type NavigationItem } from "@/app/navigation/navigationConfig";
import { useAuth } from "@/features/auth/AuthContext";
import OrganizationBrand from "@/shared/branding/OrganizationBrand";

const icons: Readonly<Record<NavigationItem["icon"], LucideIcon>> = {
  dashboard: LayoutDashboard, equipment: Truck, assignments: ClipboardList, rentals: ClipboardList,
  maintenance: Wrench, operators: Users, projects: FolderKanban, dailyLogs: ClipboardList,
  customers: Building2, billing: FileText, reports: BarChart3, settings: Settings, users: Users,
};

export default function Sidebar({ collapsed, mobileOpen, onToggle, onNavigate }: { collapsed: boolean; mobileOpen: boolean; onToggle(): void; onNavigate(): void }) {
  const { user, hasPermission } = useAuth();
  const { authentication } = useApplicationDependenciesCompatibility();
  const visibleGroups = getVisibleNavigation(user, authentication.authorizationService, hasPermission);
  const operationsItems = visibleGroups.filter((group) => group.title === "GENERAL" || group.title === "OPERATIONS").flatMap((group) => group.items);
  const groups = operationsItems.length
    ? [{ title: "OPERATIONS", items: operationsItems }, ...visibleGroups.filter((group) => group.title !== "GENERAL" && group.title !== "OPERATIONS")]
    : visibleGroups;
  return (
    <aside className={`${mobileOpen ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-40 flex h-dvh w-[216px] shrink-0 flex-col bg-[#071a33] text-white shadow-xl transition-[width,transform] duration-200 md:sticky md:top-0 md:self-start md:translate-x-0 ${collapsed ? "md:w-[68px]" : "md:w-[216px]"}`}>
      <div className={`flex h-[78px] items-center border-b border-white/10 ${collapsed ? "justify-center px-2" : "px-4"}`}>
        {collapsed ? <img src="/branding/psc-equipment-logo.png" alt="PSC Equipment logo" className="h-9 w-10 object-contain" /> : <OrganizationBrand compact inverse />}
      </div>
      <nav aria-label="Primary navigation" className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => <section key={group.title} className="mb-5">
          {!collapsed && <h2 className="mb-1.5 px-2 text-[10px] font-medium tracking-wide text-slate-400">{group.title}</h2>}
          <div className="space-y-1">{group.items.map((item) => { const Icon = icons[item.icon]; return (
            <NavLink key={item.label} to={item.path} title={collapsed ? item.label : undefined} onClick={onNavigate} className={({ isActive }) => `flex min-h-10 items-center rounded-md text-[13px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 ${collapsed ? "justify-center px-2" : "gap-3 px-2.5"} ${isActive ? "bg-blue-600 text-white shadow-sm" : "text-slate-200 hover:bg-white/8 hover:text-white"}`}>
              <Icon aria-hidden="true" size={17} className="shrink-0" />{!collapsed && <span>{item.label}</span>}
            </NavLink>
          ); })}</div>
        </section>)}
      </nav>
      <button aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} aria-expanded={!collapsed} onClick={onToggle} className={`hidden h-12 items-center border-t border-white/10 text-xs text-slate-200 hover:bg-white/8 md:flex ${collapsed ? "justify-center" : "gap-2 px-5"}`}>
        {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span>Collapse</span></>}
      </button>
    </aside>
  );
}
