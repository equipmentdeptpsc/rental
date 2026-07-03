import { Link } from "react-router-dom";

import Button from "@/components/ui/Button";

import { useMaintenance } from "@/features/maintenance/context/MaintenanceContext";

export default function MaintenancePage() {
  const { maintenance } =
    useMaintenance();

  return (
    <div className="space-y-6 p-8">

      <div className="flex items-center justify-between">

        <div>

          <h1 className="text-3xl font-bold">
            Preventive Maintenance
          </h1>

          <p className="text-slate-500">
            Manage maintenance work orders
          </p>

        </div>

        <Link to="/maintenance/new">

          <Button>
            New Work Order
          </Button>

        </Link>

      </div>

      <div className="overflow-hidden rounded-xl border bg-white">

        <table className="min-w-full">

          <thead className="bg-slate-100">

            <tr>

              <th className="p-3 text-left">
                Equipment
              </th>

              <th className="p-3 text-left">
                Type
              </th>

              <th className="p-3 text-left">
                Status
              </th>

              <th className="p-3 text-left">
                Action
              </th>

            </tr>

          </thead>

          <tbody>

            {maintenance.map((item) => (

              <tr
                key={item.id}
                className="border-t"
              >

                <td className="p-3">
                  {item.equipmentId}
                </td>

                <td className="p-3">
                  {item.maintenanceType}
                </td>

                <td className="p-3">
                  {item.status}
                </td>

                <td className="p-3">

                  <Link
                    to={`/maintenance/${item.id}`}
                    className="text-blue-600"
                  >
                    View
                  </Link>

                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>
  );
}