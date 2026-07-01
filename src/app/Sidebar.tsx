import {
    LayoutDashboard,
    Truck,
    Users,
    CalendarDays,
    FileText,
    BarChart3,
  } from "lucide-react";
  
  const menus = [
    { icon: LayoutDashboard, label: "Dashboard" },
    { icon: Truck, label: "Equipment" },
    { icon: Users, label: "Operators" },
    { icon: CalendarDays, label: "Bookings" },
    { icon: FileText, label: "Billing" },
    { icon: BarChart3, label: "Reports" },
  ];
  
  export default function Sidebar() {
    return (
      <aside className="w-64 bg-slate-800 text-white">
        <nav className="p-4">
          {menus.map((menu) => {
            const Icon = menu.icon;
  
            return (
              <button
                key={menu.label}
                className="flex w-full items-center gap-3 rounded-lg px-4 py-3 hover:bg-slate-700 transition"
              >
                <Icon size={20} />
                {menu.label}
              </button>
            );
          })}
        </nav>
      </aside>
    );
  }