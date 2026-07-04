import { useMemo } from "react";

import { useAssignment } from "../context/AssignmentContext";

export default function AssignmentHistoryTable() {
  const { assignments } =
    useAssignment();

  const rows = useMemo(
    () =>
      [...assignments].sort((a, b) =>
        b.assignedDate.localeCompare(
          a.assignedDate
        )
      ),
    [assignments]
  );

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-white p-6 text-center text-gray-500">
        No assignment history found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      <table className="min-w-full">
        <thead className="bg-gray-100">
          <tr>
            <th className="p-3 text-left">
              Equipment
            </th>

            <th className="p-3 text-left">
              Operator
            </th>

            <th className="p-3 text-left">
              Project
            </th>

            <th className="p-3 text-left">
              Assigned
            </th>

            <th className="p-3 text-left">
              Return
            </th>

            <th className="p-3 text-left">
              Status
            </th>
          </tr>
        </thead>

        <tbody>
          {rows.map((a) => (
            <tr
              key={a.id}
              className="border-t"
            >
              <td className="p-3">
                {a.equipmentId}
              </td>

              <td className="p-3">
                {a.operatorId}
              </td>

              <td className="p-3">
                {a.projectId}
              </td>

              <td className="p-3">
                {a.assignedDate}
              </td>

              <td className="p-3">
                {a.expectedReturn}
              </td>

              <td className="p-3">
                {a.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}