import { Link } from "react-router-dom";

import Button from "@/components/ui/Button";
import ResponsiveTable from "@/components/ui/ResponsiveTable";

import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";

export default function Assignments() {
  const { assignments } = useAssignment();

  const { getEquipment } = useEquipment();

  const activeAssignments = assignments.filter(
    (a) => a.status === "Active"
  );

  const completedAssignments = assignments.filter(
    (a) => a.status === "Completed"
  );

  const cancelledAssignments = assignments.filter(
    (a) => a.status === "Cancelled"
  );

  return (
    <div className="space-y-6 p-8">

      <div className="flex items-center justify-between">

        <div>

          <h1 className="text-3xl font-bold">
            Assignment Operations
          </h1>

          <p className="text-slate-500">
            Monitor equipment deployments and complete equipment returns.
          </p>

        </div>

        <Link to="/assignments/new">
          <Button>
            New Assignment
          </Button>
        </Link>

      </div>

      <div className="grid gap-4 md:grid-cols-3">

        <SummaryCard
          title="Active Assignments"
          value={activeAssignments.length}
        />

        <SummaryCard
          title="Completed"
          value={completedAssignments.length}
        />

        <SummaryCard
          title="Cancelled"
          value={cancelledAssignments.length}
        />

      </div>

      <ResponsiveTable><div className="rounded-xl border bg-white shadow-sm min-w-max">

        <table className="min-w-full">

          <thead className="bg-slate-50">

            <tr>

              <th className="px-4 py-3 text-left">
                Equipment
              </th>

              <th className="px-4 py-3 text-left">
                Assigned Date
              </th>

              <th className="px-4 py-3 text-left">
                Expected Return
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

            {assignments.length === 0 ? (

              <tr>

                <td
                  colSpan={5}
                  className="py-10 text-center text-slate-500"
                >
                  No assignments found.
                </td>

              </tr>

            ) : (

              assignments.map((assignment) => {

                const equipment =
                  getEquipment(
                    assignment.equipmentId
                  );

                return (

                  <tr
                    key={assignment.id}
                    className="border-t"
                  >

                    <td className="px-4 py-3">

                      {equipment
                        ? `${equipment.assetNo} - ${equipment.equipmentName}`
                        : "Unknown equipment"}

                    </td>

                    <td className="px-4 py-3">
                      {assignment.assignedDate}
                    </td>

                    <td className="px-4 py-3">
                      {assignment.expectedReturn}
                    </td>

                    <td className="px-4 py-3">

                      <StatusBadge
                        status={assignment.status}
                      />

                    </td>

                    <td className="px-4 py-3 text-right">

                      <Link
                        to={`/assignments/${assignment.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        View Details
                      </Link>

                    </td>

                  </tr>

                );

              })

            )}

          </tbody>

        </table>

      </div></ResponsiveTable>

    </div>
  );
}

function SummaryCard({
  title,
  value,
}: {
  title: string;
  value: number;
}) {
  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">

      <div className="text-sm text-slate-500">
        {title}
      </div>

      <div className="mt-2 text-3xl font-bold">
        {value}
      </div>

    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: string;
}) {
  let style =
    "bg-slate-100 text-slate-700";

  if (status === "Active") {
    style =
      "bg-blue-100 text-blue-700";
  }

  if (status === "Completed") {
    style =
      "bg-green-100 text-green-700";
  }

  if (status === "Cancelled") {
    style =
      "bg-red-100 text-red-700";
  }

  return (
    <span
      className={`rounded px-2 py-1 text-xs font-medium ${style}`}
    >
      {status}
    </span>
  );
}
