import type { EquipmentRecord } from "@/features/equipment/types";

interface Props {
  equipment: EquipmentRecord[];
}

export default function FleetStatusReport({
  equipment,
}: Props) {
  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <div className="border-b px-6 py-4">
        <h2 className="text-lg font-semibold">
          Fleet Status
        </h2>
      </div>

      <div className="overflow-auto">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">Asset No.</th>
              <th className="px-4 py-3 text-left">Equipment</th>
              <th className="px-4 py-3 text-left">Category</th>
              <th className="px-4 py-3 text-left">Status</th>
              <th className="px-4 py-3 text-left">Reading</th>
              <th className="px-4 py-3 text-left">Maintenance</th>
            </tr>
          </thead>

          <tbody>
            {equipment.map((item) => (
              <tr
                key={item.id}
                className="border-t"
              >
                <td className="px-4 py-3">{item.assetNo}</td>
                <td className="px-4 py-3">{item.equipmentName}</td>
                <td className="px-4 py-3">{item.category}</td>
                <td className="px-4 py-3">{item.status}</td>
                <td className="px-4 py-3">{item.currentReading}</td>
                <td className="px-4 py-3">{item.maintenanceType}</td>
              </tr>
            ))}

            {equipment.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-6 py-10 text-center text-gray-500"
                >
                  No equipment records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}