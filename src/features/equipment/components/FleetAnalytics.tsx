import { useEquipment } from "../context/EquipmentContext";
import { useRental } from "@/features/rental/context/RentalContext";

import { getFleetAnalytics } from "../utils/equipmentAnalytics";

export default function FleetAnalytics() {
  const { equipment } = useEquipment();
  const { rentals } = useRental();

  const analytics = getFleetAnalytics(
    equipment,
    rentals
  );

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">

      <h2 className="text-lg font-semibold">
        Fleet Analytics
      </h2>

      <div className="mt-6 space-y-5">

        <div>

          <div className="flex justify-between text-sm">

            <span>Fleet Utilization</span>

            <strong>
              {analytics.utilization}%
            </strong>

          </div>

          <div className="mt-2 h-3 rounded bg-slate-200">

            <div
              className="h-3 rounded bg-blue-600"
              style={{
                width: `${analytics.utilization}%`,
              }}
            />

          </div>

        </div>

        <div>

          <div className="flex justify-between text-sm">

            <span>Fleet Availability</span>

            <strong>
              {analytics.availability}%
            </strong>

          </div>

          <div className="mt-2 h-3 rounded bg-slate-200">

            <div
              className="h-3 rounded bg-green-600"
              style={{
                width: `${analytics.availability}%`,
              }}
            />

          </div>

        </div>

      </div>

    </div>
  );
}