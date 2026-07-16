import { Link } from "react-router-dom";

import Button from "@/components/ui/Button";
import ResponsiveTable from "@/components/ui/ResponsiveTable";

import { useMaintenance } from "@/features/maintenance/context/MaintenanceContext";
import { getMaintenanceDueEquipment } from "@/features/maintenance";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";

export default function MaintenancePage() {
  const { maintenance } =
    useMaintenance();

  const { equipment } =
    useEquipment();

  const dueEquipment =
    getMaintenanceDueEquipment(
      equipment,
      maintenance
    );

  const overdue =
    dueEquipment.filter(
      (x) => x.due
    );

  const dueSoon =
    dueEquipment.filter(
      (x) =>
        !x.due &&
        x.remaining <= 50
    );

  const healthy =
    dueEquipment.filter(
      (x) =>
        !x.due &&
        x.remaining > 50
    );

  return (
    <div className="space-y-6 p-8">

      <div className="flex items-center justify-between">

        <div>

          <h1 className="text-3xl font-bold">
            Maintenance
          </h1>

          <p className="mt-1 text-gray-500">
            Fleet maintenance monitoring
          </p>

        </div>

        <Link to="/maintenance/new">
          <Button>
            Schedule Maintenance
          </Button>
        </Link>

      </div>

      <div className="grid gap-4 md:grid-cols-3">

        <div className="rounded-xl border border-red-300 bg-red-50 p-5">

          <p className="text-sm text-red-700">
            Overdue
          </p>

          <h2 className="mt-2 text-3xl font-bold">
            {overdue.length}
          </h2>

        </div>

        <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-5">

          <p className="text-sm text-yellow-700">
            Due Soon
          </p>

          <h2 className="mt-2 text-3xl font-bold">
            {dueSoon.length}
          </h2>

        </div>

        <div className="rounded-xl border border-green-300 bg-green-50 p-5">

          <p className="text-sm text-green-700">
            Healthy
          </p>

          <h2 className="mt-2 text-3xl font-bold">
            {healthy.length}
          </h2>

        </div>

      </div>

      <ResponsiveTable><div className="rounded-xl border bg-white min-w-max">

        <table className="min-w-full">

          <thead className="bg-gray-100">

            <tr>

              <th className="px-4 py-3 text-left">
                Asset No.
              </th>

              <th className="px-4 py-3 text-left">
                Equipment
              </th>

              <th className="px-4 py-3 text-right">
                Current Reading
              </th>

              <th className="px-4 py-3 text-right">
                Remaining
              </th>

              <th className="px-4 py-3 text-center">
                Status
              </th>

            </tr>

          </thead>

          <tbody>

            {dueEquipment.map(
              (item) => (

                <tr
                  key={
                    item.equipment.id
                  }
                  className="border-t"
                >

                  <td className="px-4 py-3">
                    {
                      item.equipment
                        .assetNo
                    }
                  </td>

                  <td className="px-4 py-3">
                    {
                      item.equipment
                        .equipmentName
                    }
                  </td>

                  <td className="px-4 py-3 text-right">
                    {
                      item.equipment
                        .currentReading
                    }
                  </td>

                  <td className="px-4 py-3 text-right">
                    {item.remaining}
                  </td>

                  <td className="px-4 py-3 text-center">

                    {item.due ? (

                      <span className="rounded bg-red-100 px-3 py-1 text-red-700">
                        OVERDUE
                      </span>

                    ) : item.remaining <=
                      50 ? (

                      <span className="rounded bg-yellow-100 px-3 py-1 text-yellow-700">
                        DUE SOON
                      </span>

                    ) : (

                      <span className="rounded bg-green-100 px-3 py-1 text-green-700">
                        OK
                      </span>

                    )}

                  </td>

                </tr>

              )
            )}

          </tbody>

        </table>

      </div></ResponsiveTable>

    </div>
  );
}
