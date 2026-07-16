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

export default function Sidebar() {
  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col">
      <div className="border-b border-slate-700 p-6">
        <h2 className="text-lg font-bold">
          Legacy ERP
        </h2>

        <p className="text-xs text-slate-400">
          Equipment Rental Platform
        </p>
      </div>

      <nav className="flex-1 overflow-y-auto p-4">
        {menuGroups.map((group) => (
          <div key={group.title} className="mb-6">
            <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {group.title}
            </p>

            {group.items.map((item) => {
              const Icon = item.icon;

              return (
                <NavLink
                  key={item.label}
                  to={item.path}
                  end={item.path === "/"}
                  className={({ isActive }) =>
                    `mb-1 flex items-center gap-3 rounded-lg px-4 py-3 transition ${
                      isActive
                        ? "bg-blue-600 text-white"
                        : "hover:bg-slate-800 text-slate-300"
                    }`
                  }
                >
                  <Icon size={20} />

                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}