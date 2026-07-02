import EquipmentStatusBadge from "./EquipmentStatusBadge.tsx";
import { equipmentData } from "../data/equipment.mock";

export default function EquipmentTable() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="min-w-full">
        <thead className="bg-slate-100">
          <tr className="text-left">
            <th className="px-4 py-3">Asset No.</th>
            <th className="px-4 py-3">Equipment</th>
            <th className="px-4 py-3">Category</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Tracking</th>
            <th className="px-4 py-3">Reading</th>
            <th className="px-4 py-3">Project</th>
            <th className="px-4 py-3">Operator</th>
            <th className="px-4 py-3 text-center">Actions</th>
          </tr>
        </thead>

        <tbody>
          {equipmentData.map((item) => (
            <tr key={item.id} className="border-t">
              <td className="px-4 py-3">{item.assetNo}</td>
              <td className="px-4 py-3">{item.equipmentName}</td>
              <td className="px-4 py-3">{item.category}</td>
              <td className="px-4 py-3">
                <EquipmentStatusBadge status={item.status} />
              </td>
              <td className="px-4 py-3">{item.maintenanceType}</td>
              <td className="px-4 py-3">
                {item.currentReading.toLocaleString()}
              </td>
              <td className="px-4 py-3">{item.project}</td>
              <td className="px-4 py-3">{item.operator}</td>
              <td className="px-4 py-3">
  <div className="flex justify-center gap-2">
    <button className="rounded bg-slate-100 px-2 py-1 text-sm hover:bg-slate-200">
      View
    </button>

    <button className="rounded bg-blue-100 px-2 py-1 text-sm text-blue-700 hover:bg-blue-200">
      Edit
    </button>

    <button className="rounded bg-amber-100 px-2 py-1 text-sm text-amber-700 hover:bg-amber-200">
      PMS
    </button>
  </div>
</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}