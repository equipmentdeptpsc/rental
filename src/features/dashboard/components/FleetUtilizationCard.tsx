import { useMemo } from "react";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";

export default function FleetUtilizationCard() {
  const { equipment } = useEquipment();

  const stats = useMemo(() => {
    const total = equipment.length;

    const assigned = equipment.filter(
      (e) => e.status === "Assigned"
    ).length;

    const maintenance = equipment.filter(
      (e) => e.status === "Maintenance"
    ).length;

    const available = equipment.filter(
      (e) => e.status === "Available"
    ).length;

    const utilization =
      total === 0
        ? 0
        : Math.round((assigned / total) * 100);

    return {
      total,
      assigned,
      available,
      maintenance,
      utilization,
    };
  }, [equipment]);

  return (
    <div className="rounded-lg border bg-white p-6">
      <h2 className="text-lg font-semibold">
        Fleet Utilization
      </h2>

      <div className="mt-4 text-5xl font-bold text-blue-600">
        {stats.utilization}%
      </div>

      <div className="mt-5 grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-gray-500">Total</p>
          <p className="font-semibold">
            {stats.total}
          </p>
        </div>

        <div>
          <p className="text-gray-500">
            Assigned
          </p>
          <p className="font-semibold">
            {stats.assigned}
          </p>
        </div>

        <div>
          <p className="text-gray-500">
            Available
          </p>
          <p className="font-semibold">
            {stats.available}
          </p>
        </div>

        <div>
          <p className="text-gray-500">
            Maintenance
          </p>
          <p className="font-semibold">
            {stats.maintenance}
          </p>
        </div>
      </div>
    </div>
  );
}