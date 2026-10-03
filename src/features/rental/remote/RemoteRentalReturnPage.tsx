import { useMemo } from "react";
import { Link } from "react-router-dom";

import Button from "@/components/ui/Button";
import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useOperator } from "@/features/operators/context/OperatorContext";
import { useProject } from "@/features/project/context/ProjectContext";
import RentalQuickActions from "@/features/rental/components/RentalQuickActions";
import { useRental } from "@/features/rental/context/RentalContext";
import { useRentalListData } from "@/features/rental/hooks/useRentalListData";

export default function RemoteRentalReturnPage({ rentalId }: { rentalId: string }) {
  const localRental = useRental();
  const localAssignments = useAssignment().assignments;
  const localEquipment = useEquipment().equipment;
  const localOperators = useOperator().operators;
  const localProjects = useProject().projects;
  const fallback = useMemo(() => ({
    rentals: localRental.rentals,
    rentalEquipmentLines: localRental.rentalEquipmentLines,
    assignments: localAssignments,
    equipment: localEquipment,
    operators: localOperators,
    projects: localProjects,
    customers: [],
    costCodes: [],
    activityCodes: [],
  }), [localRental.rentals, localRental.rentalEquipmentLines, localAssignments, localEquipment, localOperators, localProjects]);
  const list = useRentalListData(fallback);

  if (list.status === "loading") return <main className="p-8">Loading canonical Rental return…</main>;
  if (list.status === "error") return <main className="space-y-3 p-8" role="alert"><p className="rounded border border-red-200 bg-red-50 p-4 text-red-800">{list.message}</p><Button onClick={list.retry}>Retry</Button></main>;

  const rental = list.data.rentals.find((item) => item.id === rentalId);
  if (!rental) return <main className="p-8">Rental not found.</main>;

  const lines = list.data.rentalEquipmentLines.filter((line) => line.rentalId === rental.id);
  const equipment = lines.map((line) => list.data.equipment.find((item) => item.id === line.equipmentId)).filter(Boolean);

  return <main className="mx-auto max-w-3xl space-y-6 p-8">
    <header>
      <Link className="text-blue-700" to={`/rentals/${rental.id}/workspace`}>← Rental Workspace</Link>
      <h1 className="mt-2 text-3xl font-bold">Return Rental Equipment</h1>
      <p className="mt-2 text-slate-500">Confirm the equipment return through the canonical Rental lifecycle service.</p>
    </header>
    <section className="space-y-3 rounded-xl border bg-white p-6">
      <Detail label="Rental" value={rental.rentalNumber ?? rental.id} />
      <Detail label="Rental status" value={rental.status} />
      <Detail label="Equipment" value={equipment.map((item) => item ? `${item.assetNo} — ${item.equipmentName}` : undefined).filter(Boolean).join(", ") || "Unavailable"} />
      <Detail label="Expected return" value={rental.expectedReturn ?? "Not specified"} />
    </section>
    <RentalQuickActions rental={rental} hideClose />
  </main>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between gap-6"><span className="text-sm text-slate-500">{label}</span><span className="text-right font-medium">{value}</span></div>;
}
