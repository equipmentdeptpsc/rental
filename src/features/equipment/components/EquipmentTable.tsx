import { Link } from "react-router-dom";

import { useEquipment } from "../context/EquipmentContext";
import { useProject } from "@/features/project/context/ProjectContext";
import { useOperator } from "@/features/operators/context/OperatorContext";

import EquipmentStatusBadge from "./EquipmentStatusBadge";

export default function EquipmentTable() {
  const { equipment } = useEquipment();

  const { projects } = useProject();

  const { operators } = useOperator();

  function getProjectName(projectId: string) {
    return (
      projects.find(
        (p) => p.id === projectId
      )?.projectName ?? "-"
    );
  }

  function getOperatorName(operatorId: string) {
    return (
      operators.find(
        (o) => o.id === operatorId
      )?.name ?? "-"
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-white">

      <table className="min-w-full">

        <thead className="bg-slate-50">

          <tr>

            <th className="px-4 py-3 text-left">
              Asset No
            </th>

            <th className="px-4 py-3 text-left">
              Equipment
            </th>

            <th className="px-4 py-3 text-left">
              Category
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
                {item.category}
              </td>

              <td className="px-4 py-3">
                {getProjectName(item.projectId)}
              </td>

              <td className="px-4 py-3">
                {getOperatorName(item.operatorId)}
              </td>

              <td className="px-4 py-3">
                <EquipmentStatusBadge
                  status={item.status}
                />
              </td>

              <td className="px-4 py-3 text-right">

                <Link
                  to={`/equipment/${item.id}`}
                  className="text-blue-600 hover:underline"
                >
                  View
                </Link>

              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>
  );
}