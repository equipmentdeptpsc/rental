import type { MaintenanceRecord } from "@/features/maintenance/types";

interface Props {
  maintenance: MaintenanceRecord[];
}

export default function MaintenanceReport({
  maintenance,
}: Props) {
  return (
    <div className="rounded-xl border bg-white">
      <div className="border-b px-6 py-4">
        <h2 className="font-semibold">
          Maintenance Report
        </h2>
      </div>

      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left">
              Scheduled
            </th>

            <th className="px-4 py-3 text-left">
              Technician
            </th>

            <th className="px-4 py-3 text-left">
              Status
            </th>
          </tr>
        </thead>

        <tbody>
          {maintenance.map((item) => (
            <tr
              key={item.id}
              className="border-t"
            >
              <td className="px-4 py-3">
                {item.scheduledDate}
              </td>

              <td className="px-4 py-3">
                {item.technician}
              </td>

              <td className="px-4 py-3">
                {item.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}