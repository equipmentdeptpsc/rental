import { useMemo } from "react";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";

export default function FleetUtilization() {
  const { equipment } = useEquipment();

  const stats = useMemo(() => {
    const total = equipment.length;

    const available = equipment.filter(
      (e) => e.status === "Available"
    ).length;

    const assigned = equipment.filter(
      (e) => e.status === "Assigned"
    ).length;

    const maintenance = equipment.filter(
      (e) => e.status === "Maintenance"
    ).length;

    const utilization =
      total === 0
        ? 0
        : Math.round(
            (assigned / total) * 100
          );

    return {
      total,
      available,
      assigned,
      maintenance,
      utilization,
    };
  }, [equipment]);

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">

      <div className="mb-5 flex items-center justify-between">

        <h2 className="text-lg font-semibold">
          Fleet Utilization
        </h2>

        <span className="rounded bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700">
          {stats.utilization}%
        </span>

      </div>

      <div className="space-y-4">

        <Metric
          label="Total Equipment"
          value={stats.total}
        />

        <Metric
          label="Available"
          value={stats.available}
        />

        <Metric
          label="Assigned"
          value={stats.assigned}
        />

        <Metric
          label="Maintenance"
          value={stats.maintenance}
        />

      </div>

      <div className="mt-6">

        <div className="mb-2 flex justify-between text-sm">

          <span>Fleet Utilization</span>

          <span>{stats.utilization}%</span>

        </div>

        <div className="h-3 overflow-hidden rounded-full bg-slate-200">

          <div
  className="h-full rounded-full bg-blue-600 transition-all"
            style={{
              width: `${stats.utilization}%`,
            }}
          />

        </div>

      </div>

    </div>
  );
}

interface MetricProps {
  label: string;
  value: number;
}

function Metric({
  label,
  value,
}: MetricProps) {
  return (
    <div className="flex items-center justify-between">

      <span className="text-slate-600">
        {label}
      </span>

      <span className="font-semibold">
        {value}
      </span>

    </div>
  );
}