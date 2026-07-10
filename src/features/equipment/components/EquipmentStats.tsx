import type { EquipmentRecord } from "../types";

interface Props {
  equipment: EquipmentRecord;

  totalAssignments: number;

  totalRentals: number;

  totalMaintenance: number;

  totalWorkingHours: number;
}

function StatCard({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border bg-white p-5">
      <div className="text-sm text-slate-500">
        {title}
      </div>

      <div className="mt-2 text-2xl font-bold">
        {value}
      </div>
    </div>
  );
}

export default function EquipmentStats({
  equipment,
  totalAssignments,
  totalRentals,
  totalMaintenance,
  totalWorkingHours,
}: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
      <StatCard
        title="Status"
        value={equipment.status}
      />

      <StatCard
        title="Current Reading"
        value={equipment.currentReading}
      />

      <StatCard
        title="Working Hours"
        value={totalWorkingHours}
      />

      <StatCard
        title="Assignments"
        value={totalAssignments}
      />

      <StatCard
        title="Rentals"
        value={totalRentals}
      />

      <StatCard
        title="Maintenance"
        value={totalMaintenance}
      />
    </div>
  );
}