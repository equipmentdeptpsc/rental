import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/toast/ToastContext";
import { createDeur } from "@/features/rental/deur/services/CreateDeurService";
import { useRentalWorkspaceAggregate } from "..";

export default function CreateDeurAction() {
  const aggregate = useRentalWorkspaceAggregate();
  const { showToast } = useToast();
  const hasActiveDeur = Boolean(aggregate.activeDeur);
  const equipment = aggregate.equipment;
  const operator = aggregate.operator;

  function create() {
    const result = createDeur({
      rentalId: aggregate.rental.id,
      rentalStatus: aggregate.rental.status,
      equipmentId: equipment?.id ?? "",
      operatorId: operator?.id ?? "",
      assignmentId: aggregate.assignment?.id,
      projectId: aggregate.project?.id ?? aggregate.rental.projectId,
      customerId: aggregate.rental.customerId,
    });

    if (!result.success) {
      showToast(result.message, "error");
      return;
    }

    showToast("DEUR created successfully.", "success");
  }

  if (hasActiveDeur) {
    return (
      <p className="text-sm text-slate-500">
        An active DEUR already exists for this rental.
      </p>
    );
  }

  if (aggregate.rental.status !== "Released") {
    return (
      <p className="text-sm text-slate-500">
        A DEUR can be created after the rental is released.
      </p>
    );
  }

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Create DEUR</h2>
      <p className="mt-2 text-sm text-slate-500">
        {equipment ? `${equipment.assetNo} - ${equipment.equipmentName}` : "Unknown equipment"}
        {operator ? ` · ${operator.name}` : " · Operator required"}
        {aggregate.project ? ` · ${aggregate.project.projectCode} - ${aggregate.project.projectName}` : ""}
      </p>
      <div className="mt-4">
        <Button type="button" onClick={create}>Create DEUR</Button>
      </div>
    </div>
  );
}
