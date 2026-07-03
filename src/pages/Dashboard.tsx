import {
  Truck,
  Wrench,
  ClipboardList,
  CheckCircle,
  AlertTriangle,
} from "lucide-react";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useRental } from "@/features/rental/context/RentalContext";

import { getFleetAnalytics } from "@/features/equipment/utils/equipmentAnalytics";

import FleetAnalytics from "@/features/equipment/components/FleetAnalytics";
import MaintenanceDueWidget from "@/features/equipment/components/MaintenanceDueWidget";
import RecentRentalActivity from "@/features/rental/components/RecentRentalActivity";
import RecentAuditActivity from "@/features/equipment/audit/components/RecentAuditActivity";

function Card({
  title,
  value,
  color,
  icon,
}: {
  title: string;
  value: number;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-slate-500">
            {title}
          </div>

          <div className="mt-2 text-3xl font-bold">
            {value}
          </div>
        </div>

        <div className={`rounded-xl p-4 ${color}`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { equipment } = useEquipment();
  const { rentals } = useRental();

  const analytics = getFleetAnalytics(
    equipment,
    rentals
  );

  return (
    <div className="space-y-8 p-8">

      <div>

        <h1 className="text-3xl font-bold">
          Dashboard
        </h1>

        <p className="text-slate-500">
          Fleet Management Overview
        </p>

      </div>

      <div className="grid gap-6 xl:grid-cols-6">

        <Card
          title="Fleet"
          value={analytics.totalEquipment}
          color="bg-slate-100"
          icon={<Truck />}
        />

        <Card
          title="Available"
          value={analytics.available}
          color="bg-green-100"
          icon={<CheckCircle />}
        />

        <Card
          title="Assigned"
          value={analytics.assigned}
          color="bg-blue-100"
          icon={<Truck />}
        />

        <Card
          title="Maintenance"
          value={analytics.maintenance}
          color="bg-yellow-100"
          icon={<Wrench />}
        />

        <Card
          title="Rentals"
          value={analytics.activeRentals}
          color="bg-purple-100"
          icon={<ClipboardList />}
        />

        <Card
          title="Overdue"
          value={analytics.overdueRentals}
          color="bg-red-100"
          icon={<AlertTriangle />}
        />

      </div>

      <div className="grid gap-6 xl:grid-cols-2">

        <FleetAnalytics />

        <MaintenanceDueWidget />

      </div>

      <div className="grid gap-6 xl:grid-cols-2">

        <RecentRentalActivity />

        <RecentAuditActivity />

      </div>

    </div>
  );
}