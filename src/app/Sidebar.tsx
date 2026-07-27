import {
  LayoutDashboard,
  Truck,
  Users,
  FileText,
  BarChart3,
  FolderKanban,
  ClipboardList,
  Wrench,
  Settings,
} from "lucide-react";

import { NavLink } from "react-router-dom";
import { Building2 } from "lucide-react";
import OrganizationBrand from "@/shared/branding/OrganizationBrand";

const menuGroups = [
  {
    title: "GENERAL",
    items: [
      {
        icon: LayoutDashboard,
        label: "Dashboard",
        path: "/",
      },
    ],
  },

  {
    title: "OPERATIONS",
    items: [
      {
        icon: Truck,
        label: "Equipment",
        path: "/equipment",
      },

      {
        icon: ClipboardList,
        label: "Assignments",
        path: "/assignments",
      },

      {
        icon: ClipboardList,
        label: "Rentals",
        path: "/rentals",
      },

      {
        icon: Wrench,
        label: "Maintenance",
        path: "/maintenance",
      },

      {
        icon: Users,
        label: "Operators",
        path: "/operators",
      },

      {
        icon: FolderKanban,
        label: "Projects",
        path: "/projects",
      },

      {
        icon: ClipboardList,
        label: "Daily Logs",
        path: "/daily-logs",
      },

      {
        icon: Building2,
        label: "Customers",
        path: "/customers",
      },
    ],
  },

  {
    title: "FINANCE",
    items: [
      {
        icon: FileText,
        label: "Billing",
        path: "/billing",
      },
    ],
  },

  {
    title: "ANALYTICS",
    items: [
      {
        icon: BarChart3,
        label: "Reports",
        path: "/reports",
      },
    ],
  },

  {
    title: "SYSTEM",
    items: [
      {
        icon: Settings,
        label: "Settings",
        path: "/settings",
      },
    ],
  },
];

export default function Sidebar({ collapsed, mobileOpen, onToggle, onNavigate }: { collapsed: boolean; mobileOpen: boolean; onToggle(): void; onNavigate(): void }) {
  return (
    <aside className={`${mobileOpen ? "translate-x-0" : "-translate-x-full"} fixed inset-y-0 left-0 z-40 flex w-64 flex-col bg-slate-900 text-white transition-transform md:static md:translate-x-0 ${collapsed ? "md:w-16" : "md:w-64"}`}>
      <div className="border-b border-slate-700 p-4">
        <button aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} aria-expanded={!collapsed} onClick={onToggle} className="hidden rounded p-2 hover:bg-slate-800 md:block">☰</button>
        {!collapsed && <div className="mt-3"><OrganizationBrand compact inverse /></div>}
      </div>

      <nav className="flex-1 overflow-y-auto p-4">
        {menuGroups.map((group) => (
          <div key={group.title} className="mb-6">
            {!collapsed && <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {group.title}
            </p>}

            {group.items.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.label}
                  to={item.path}
                  end={item.path === "/"}
                  title={item.label}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `mb-1 flex items-center gap-3 rounded-lg px-4 py-3 transition ${
                      isActive
                        ? "bg-blue-600 text-white"
                        : "hover:bg-slate-800 text-slate-300"
                    }`
                  }
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
