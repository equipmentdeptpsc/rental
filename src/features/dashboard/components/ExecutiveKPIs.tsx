import { useMemo } from "react";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useProject } from "@/features/project/context/ProjectContext";
import { useCustomer } from "@/features/customer/context/CustomerContext";

function KPI({
  title,
  value,
}: {
  title: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <div className="text-sm text-slate-500">
        {title}
      </div>

      <div className="mt-3 text-3xl font-bold">
        {value}
      </div>
    </div>
  );
}

export default function ExecutiveKPIs() {
  const { equipment } = useEquipment();
  const { assignments } = useAssignment();
  const { projects } = useProject();
  const { customers } = useCustomer();

  const utilization = useMemo(() => {
    if (equipment.length === 0) return 0;

    const assigned = equipment.filter(
      (e) => e.status === "Assigned"
    ).length;

    return Math.round(
      (assigned / equipment.length) * 100
    );
  }, [equipment]);

  const activeAssignments =
    assignments.filter(
      (a) => a.status === "Active"
    ).length;

  const activeProjects =
    projects.filter(
      (p) => !p.deleted
    ).length;

    const activeCustomers =
    customers.length;

  return (
    <div className="grid gap-6 lg:grid-cols-4">
      <KPI
        title="Fleet Utilization"
        value={`${utilization}%`}
      />

      <KPI
        title="Active Assignments"
        value={activeAssignments}
      />

      <KPI
        title="Projects"
        value={activeProjects}
      />

      <KPI
        title="Customers"
        value={activeCustomers}
      />
    </div>
  );
}