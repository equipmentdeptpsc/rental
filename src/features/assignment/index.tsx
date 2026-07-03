import { Link } from "react-router-dom";

import Button from "@/components/ui/Button";

import { useAssignment } from "@/features/assignment/context/AssignmentContext";

export default function AssignmentsPage() {
  const {
    assignments,
  } = useAssignment();

  return (
    <div className="space-y-6">

      <div className="flex justify-between items-center">

        <div>

          <h1 className="text-3xl font-bold">
            Assignments
          </h1>

          <p className="text-slate-500">
            Equipment deployment records.
          </p>

        </div>

        <Link to="/assignments/new">

          <Button>
            New Assignment
          </Button>

        </Link>

      </div>

      <div className="rounded-lg border bg-white overflow-hidden">

        <table className="min-w-full">

          <thead className="bg-slate-50">

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
                Status
              </th>

            </tr>

          </thead>

          <tbody>

            {assignments.map(
              (
                assignment
              ) => (
                <tr
                  key={
                    assignment.id
                  }
                  className="border-t"
                >
                  <td className="p-3">
                    {
                      assignment.equipmentId
                    }
                  </td>

                  <td className="p-3">
                    {
                      assignment.operatorId
                    }
                  </td>

                  <td className="p-3">
                    {
                      assignment.projectId
                    }
                  </td>

                  <td className="p-3">
                    {
                      assignment.status
                    }
                  </td>
                </tr>
              )
            )}

          </tbody>

        </table>

      </div>

    </div>
  );
}