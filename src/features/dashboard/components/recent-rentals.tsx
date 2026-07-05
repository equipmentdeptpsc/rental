import { Link } from "react-router-dom";

import type { RentalRecord } from "@/features/rental/types";
import type { EquipmentRecord } from "@/features/equipment/types";

interface Props {
  rentals: RentalRecord[];
  equipment: EquipmentRecord[];
}

export default function RecentRentals({
  rentals,
  equipment,
}: Props) {
  const recent = [...rentals]
    .sort(
      (a, b) =>
        new Date(b.dateOut).getTime() -
        new Date(a.dateOut).getTime()
    )
    .slice(0, 5);

  function equipmentName(id: string) {
    return (
      equipment.find(
        (e) => e.id === id
      )?.equipmentName ?? "-"
    );
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <div className="border-b px-6 py-4">
        <h2 className="text-lg font-semibold">
          Recent Rentals
        </h2>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">
                Equipment
              </th>

              <th className="px-4 py-3 text-left">
                Customer
              </th>

              <th className="px-4 py-3 text-left">
                Date Out
              </th>

              <th className="px-4 py-3 text-left">
                Return
              </th>

              <th className="px-4 py-3 text-left">
                Status
              </th>
            </tr>
          </thead>

          <tbody>
            {recent.map((rental) => (
              <tr
                key={rental.id}
                className="border-t"
              >
                <td className="px-4 py-3">
                  <Link
                    to={`/rentals/return/${rental.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {equipmentName(
                      rental.equipmentId
                    )}
                  </Link>
                </td>

                <td className="px-4 py-3">
                  {rental.customer}
                </td>

                <td className="px-4 py-3">
                  {rental.dateOut}
                </td>

                <td className="px-4 py-3">
                  {rental.expectedReturn}
                </td>

                <td className="px-4 py-3">
                  {rental.status}
                </td>
              </tr>
            ))}

            {recent.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-10 text-center text-gray-500"
                >
                  No rental records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}