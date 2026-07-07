import { Link } from "react-router-dom";

import Button from "@/components/ui/Button";

import { useRental } from "@/features/rental/context/RentalContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";

export default function RentalPage() {
  const { rentals } = useRental();

  const { getEquipment } =
    useEquipment();

  return (
    <div className="space-y-6 p-8">

      <div className="flex items-center justify-between">

        <div>

          <h1 className="text-3xl font-bold">
            Rental Transactions
          </h1>

          <p className="text-slate-500">
            Manage equipment rentals.
          </p>

        </div>

        <Link to="/rentals/new">

          <Button>

            New Rental

          </Button>

        </Link>

      </div>

      <div className="overflow-hidden rounded-lg border bg-white">

        <table className="min-w-full">

          <thead className="bg-slate-50">

            <tr>

              <th className="px-4 py-3 text-left">
                Equipment
              </th>

              <th className="px-4 py-3 text-left">
                Customer
              </th>

              <th className="px-4 py-3 text-left">
                Project
              </th>

              <th className="px-4 py-3 text-left">
                Date Out
              </th>

              <th className="px-4 py-3 text-left">
                Expected Return
              </th>

              <th className="px-4 py-3 text-left">
                Status
              </th>

              <th className="px-4 py-3 text-left">
                Actions
              </th>

            </tr>

          </thead>

          <tbody>

            {rentals.length === 0 ? (

              <tr>

                <td
                  colSpan={7}
                  className="py-10 text-center text-slate-500"
                >
                  No rental transactions found.
                </td>

              </tr>

            ) : (

              rentals.map((rental) => {

                const equipment =
                  getEquipment(
                    rental.equipmentId
                  );

                return (

                  <tr
                    key={rental.id}
                    className="border-t"
                  >

                    <td className="px-4 py-3">

                      {equipment
                        ? `${equipment.assetNo} - ${equipment.equipmentName}`
                        : rental.equipmentId}

                    </td>

                    <td className="px-4 py-3">
                      {rental.customer}
                    </td>

                    <td className="px-4 py-3">
                      {rental.project}
                    </td>

                    <td className="px-4 py-3">
                      {rental.dateOut}
                    </td>

                    <td className="px-4 py-3">
                      {rental.expectedReturn}
                    </td>

                    <td className="px-4 py-3">

                      <span
                        className={`rounded px-2 py-1 text-xs font-medium ${
                          rental.status ===
                          "Returned"
                            ? "bg-green-100 text-green-700"
                            : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {rental.status}
                      </span>

                    </td>

                    <td className="px-4 py-3">

                      <div className="flex gap-3">

                        <Link
                          to={`/rentals/${rental.id}/workspace`}
                          className="font-medium text-blue-600 hover:underline"
                        >
                          Workspace
                        </Link>

                        {rental.status ===
                          "Active" && (

                          <Link
                            to={`/rentals/return/${rental.id}`}
                            className="font-medium text-emerald-600 hover:underline"
                          >
                            Return
                          </Link>

                        )}

                      </div>

                    </td>

                  </tr>

                );

              })

            )}

          </tbody>

        </table>

      </div>

    </div>
  );
}