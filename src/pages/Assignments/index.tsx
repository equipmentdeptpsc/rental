import { Link } from "react-router-dom";

import Button from "@/components/ui/Button";

import { useAssignment } from "@/features/assignment/context/AssignmentContext";

export default function Assignments() {
  const { assignments } =
    useAssignment();

  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">
          Assignments
        </h1>

        <Link to="/assignments/new">
          <Button>
            New Assignment
          </Button>
        </Link>
      </div>

      <div className="rounded-xl border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">
                Assigned
              </th>

              <th className="px-4 py-3 text-left">
                Return
              </th>

              <th className="px-4 py-3 text-left">
                Status
              </th>

              <th className="px-4 py-3 text-left">
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

                <td className="px-4 py-3 text-right">
                  <Link
                    to={`/assignments/${item.id}`}
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
    </div>
  );
}