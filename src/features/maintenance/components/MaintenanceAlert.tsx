import { useEquipment } from "@/features/equipment/context/EquipmentContext";

import { requiresMaintenance } from "../utils/maintenanceScheduler";

export default function MaintenanceAlert() {
  const { equipment } =
    useEquipment();

  const due = equipment.filter(
    requiresMaintenance
  );

  if (due.length === 0)
    return null;

  return (
    <div className="rounded-xl border border-red-300 bg-red-50 p-6">

      <h2 className="font-bold text-red-700">
        Maintenance Alert
      </h2>

      <p className="mb-4 text-sm text-red-600">
        Equipment requiring immediate maintenance
      </p>

      <div className="space-y-3">

        {due.map((item) => (

          <div
            key={item.id}
            className="rounded border bg-white p-3"
          >

            <div className="font-semibold">
              {item.assetNo}
            </div>

            <div className="text-sm">
              {item.equipmentName}
            </div>

            <div className="text-xs text-red-600">
              Current Reading:{" "}
              {item.currentReading}
            </div>

          </div>

        ))}

      </div>

    </div>
  );
}