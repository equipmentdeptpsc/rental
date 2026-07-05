import { Link } from "react-router-dom";

import type { AssignmentRecord } from "@/features/assignment/types";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { Operator } from "@/features/operators/types";
import type { ProjectRecord } from "@/features/project/types";

interface Props {
  assignments: AssignmentRecord[];
  equipment: EquipmentRecord[];
  operators: Operator[];
  projects: ProjectRecord[];
}

export default function RecentAssignments({
  assignments,
  equipment,
  operators,
  projects,
}: Props) {
  function equipmentName(id: string) {
    return (
      equipment.find(
        (e) => e.id === id
      )?.equipmentName ?? "-"
    );
  }

  function operatorName(id: string) {
    return (
      operators.find(
        (o) => o.id === id
      )?.name ?? "-"
    );
  }

  function projectName(id: string) {
    return (
      projects.find(
        (p) => p.id === id
      )?.projectName ?? "-"
    );
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <div className="border-b px-6 py-4">
        <h2 className="text-lg font-semibold">
          Recent Assignments
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
                Operator
              </th>

              <th className="px-4 py-3 text-left">
                Project
              </th>

              <th className="px-4 py-3 text-left">
                Date
              </th>

              <th className="px-4 py-3 text-left">
                Status
              </th>
            </tr>
          </thead>

          <tbody>
            {assignments.map((assignment) => (
              <tr
                key={assignment.id}
                className="border-t"
              >
                <td className="px-4 py-3">
                  <Link
                    to={`/assignments/${assignment.id}`}
                    className="text-blue-600 hover:underline"
                  >
                    {equipmentName(
                      assignment.equipmentId
                    )}
                  </Link>
                </td>

                <td className="px-4 py-3">
                  {operatorName(
                    assignment.operatorId
                  )}
                </td>

                <td className="px-4 py-3">
                  {projectName(
                    assignment.projectId
                  )}
                </td>

                <td className="px-4 py-3">
                  {assignment.assignedDate}
                </td>

                <td className="px-4 py-3">
                  {assignment.status}
                </td>
              </tr>
            ))}

            {assignments.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-6 py-10 text-center text-gray-500"
                >
                  No assignments found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}