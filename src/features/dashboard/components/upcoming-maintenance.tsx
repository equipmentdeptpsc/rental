import { Link } from "react-router-dom";

import type { MaintenanceRecord } from "@/features/maintenance/types";
import type { EquipmentRecord } from "@/features/equipment/types";

interface Props {
  maintenance: MaintenanceRecord[];
  equipment: EquipmentRecord[];
}

export default function UpcomingMaintenance({
  maintenance,
  equipment,
}: Props) {
  function equipmentName(
    equipmentId: string
  ) {
    return (
      equipment.find(
        (e) => e.id === equipmentId
      )?.equipmentName ?? "-"
    );
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <div className="border-b px-6 py-4">
        <h2 className="text-lg font-semibold">
          Upcoming Maintenance
        </h2>
      </div>

      <div className="divide-y">
        {maintenance.length === 0 && (
          <div className="p-6 text-center text-gray-500">
            No upcoming maintenance.
          </div>
        )}

        {maintenance.map((item) => (
          <Link
            key={item.id}
            to={`/maintenance/${item.id}`}
            className="block p-4 hover:bg-gray-50 transition"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">
                  {equipmentName(
                    item.equipmentId
                  )}
                </div>

                <div className="text-sm text-gray-500">
                  {item.maintenanceType}
                </div>
              </div>

              <div className="text-right">
                <div className="font-medium">
                  {item.scheduledDate}
                </div>

                <div className="text-xs text-gray-500">
                  Scheduled
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}