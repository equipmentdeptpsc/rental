import { Link } from "react-router-dom";

import Button from "@/components/ui/Button";

import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { useProject } from "@/features/project/context/ProjectContext";

export default function AssignmentsPage() {
  const { assignments } = useAssignment();

  const { equipment } = useEquipment();
  const { operators } = useOperator();
  const { projects } = useProject();

  function equipmentName(id: string) {
    const item = equipment.find((e) => e.id === id);

    if (!item) return "Unknown Equipment";

    return `${item.assetNo} • ${item.equipmentName}`;
  }

  function operatorName(id: string) {
    const item = operators.find((o) => o.id === id);

    return item?.name ?? "Unknown Operator";
  }

  function projectName(id: string) {
    const item = projects.find((p) => p.id === id);

    return item?.projectName ?? "Unknown Project";
  }

  return (
    <div className="space-y-6 p-6">

      <div className="flex items-center justify-between">

        <div>

          <h1 className="text-3xl font-bold">
            Equipment Assignments
          </h1>

          <p className="text-slate-500">
            Track equipment deployment across projects.
          </p>

        </div>

        <Link to="/assignments/new">
          <Button>
            New Assignment
          </Button>
        </Link>

      </div>

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">

        <table className="min-w-full">

          <thead className="bg-slate-50">

            <tr className="text-left">

              <th className="p-4">
                Equipment
              </th>

              <th className="p-4">
                Operator
              </th>

              <th className="p-4">
                Project
              </th>

              <th className="p-4">
                Assigned Date
              </th>

              <th className="p-4">
                Expected Return
              </th>

              <th className="p-4">
                Status
              </th>

              <th className="p-4 text-center">
                Actions
              </th>

            </tr>

          </thead>

          <tbody>

            {assignments.length === 0 && (

              <tr>

                <td
                  colSpan={7}
                  className="p-10 text-center text-slate-500"
                >
                  No equipment assignments found.
                </td>

              </tr>

            )}

            {assignments.map((assignment) => (

              <tr
                key={assignment.id}
                className="border-t hover:bg-slate-50"
              >

                <td className="p-4 font-medium">
                  {equipmentName(
                    assignment.equipmentId
                  )}
                </td>

                <td className="p-4">
                  {operatorName(
                    assignment.operatorId
                  )}
                </td>

                <td className="p-4">
                  {projectName(
                    assignment.projectId
                  )}
                </td>

                <td className="p-4">
                  {assignment.assignedDate}
                </td>

                <td className="p-4">
                  {assignment.expectedReturn}
                </td>

                <td className="p-4">

                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      assignment.status === "Active"
                        ? "bg-green-100 text-green-700"
                        : "bg-slate-200 text-slate-700"
                    }`}
                  >
                    {assignment.status}
                  </span>

                </td>

                <td className="p-4">

                  <div className="flex justify-center gap-2">

                    <Link
                      to={`/assignments/${assignment.id}`}
                    >
                      <Button
                        variant="secondary"
                      >
                        View
                      </Button>
                    </Link>

                  </div>

                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>
  );
}