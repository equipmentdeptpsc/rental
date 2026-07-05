import type { AssignmentRecord } from "@/features/assignment/types";

interface Props {
  assignments: AssignmentRecord[];
}

export default function AssignmentReport({
  assignments,
}: Props) {
  return (
    <div className="rounded-xl border bg-white">
      <div className="border-b px-6 py-4">
        <h2 className="font-semibold">
          Assignment Report
        </h2>
      </div>

      <table className="min-w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left">
              Assigned Date
            </th>

            <th className="px-4 py-3 text-left">
              Expected Return
            </th>

            <th className="px-4 py-3 text-left">
              Status
            </th>
          </tr>
        </thead>

        <tbody>
          {assignments.map((item) => (
            <tr
              key={item.id}
              className="border-t"
            >
              <td className="px-4 py-3">
                {item.assignedDate}
              </td>

              <td className="px-4 py-3">
                {item.expectedReturn}
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