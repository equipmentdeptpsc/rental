import { useAssignment } from "../context/AssignmentContext";

export default function AssignmentStats() {
  const { assignments } =
    useAssignment();

  const active =
    assignments.filter(
      (a) => a.status === "Active"
    ).length;

  const completed =
    assignments.filter(
      (a) =>
        a.status === "Completed"
    ).length;

  const cancelled =
    assignments.filter(
      (a) =>
        a.status === "Cancelled"
    ).length;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-lg border bg-white p-5">
        <div className="text-sm text-gray-500">
          Active Assignments
        </div>

        <div className="mt-2 text-3xl font-bold">
          {active}
        </div>
      </div>

      <div className="rounded-lg border bg-white p-5">
        <div className="text-sm text-gray-500">
          Completed
        </div>

        <div className="mt-2 text-3xl font-bold">
          {completed}
        </div>
      </div>

      <div className="rounded-lg border bg-white p-5">
        <div className="text-sm text-gray-500">
          Cancelled
        </div>

        <div className="mt-2 text-3xl font-bold">
          {cancelled}
        </div>
      </div>
    </div>
  );
}