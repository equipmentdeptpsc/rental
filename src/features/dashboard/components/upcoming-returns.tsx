import { Link } from "react-router-dom";

import type { RentalRecord } from "@/features/rental/types";
import type { EquipmentRecord } from "@/features/equipment/types";

interface Props {
  rentals: RentalRecord[];
  equipment: EquipmentRecord[];
}

export default function UpcomingReturns({
  rentals,
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
          Upcoming Returns
        </h2>
      </div>

      <div className="divide-y">
        {rentals.length === 0 && (
          <div className="p-6 text-center text-gray-500">
            No upcoming returns.
          </div>
        )}

        {rentals.map((rental) => (
          <Link
            key={rental.id}
            to={`/rentals/return/${rental.id}`}
            className="block p-4 hover:bg-gray-50 transition"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">
                  {equipmentName(
                    rental.equipmentId
                  )}
                </div>

                <div className="text-sm text-gray-500">
                  {rental.customer}
                </div>
              </div>

              <div className="text-right">
                <div className="font-medium">
                  {rental.expectedReturn}
                </div>

                <div className="text-xs text-gray-500">
                  Expected Return
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}