import { useNavigate } from "react-router-dom";

import { useEquipmentView } from "../hooks/useEquipmentView";

export default function EquipmentTable() {
  const navigate = useNavigate();

  const equipment =
    useEquipmentView();

  return (
    <div className="overflow-hidden rounded-lg border bg-white">
      <table className="min-w-full">
        <thead className="bg-slate-100">
          <tr>
            <th className="px-4 py-3 text-left">
              Asset
            </th>

            <th className="px-4 py-3 text-left">
              Equipment
            </th>

            <th className="px-4 py-3 text-left">
              Project
            </th>

            <th className="px-4 py-3 text-left">
              Operator
            </th>

            <th className="px-4 py-3 text-left">
              Status
            </th>

            <th className="px-4 py-3 text-right">
              Action
            </th>
          </tr>
        </thead>

        <tbody>
          {equipment.map((item) => (
            <tr
              key={item.id}
              className="border-t hover:bg-slate-50"
            >
              <td className="px-4 py-3">
                {item.assetNo}
              </td>

              <td className="px-4 py-3">
                {item.equipmentName}
              </td>

              <td className="px-4 py-3">
                {item.projectName}
              </td>

              <td className="px-4 py-3">
                {item.operatorName}
              </td>

              <td className="px-4 py-3">
                {item.status}
              </td>

              <td className="px-4 py-3 text-right">
                <button
                  className="text-blue-600 hover:underline"
                  onClick={() =>
                    navigate(
                      `/equipment/${item.id}`
                    )
                  }
                >
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}