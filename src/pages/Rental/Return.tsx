import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import Button from "@/components/ui/Button";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/toast/ToastContext";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useRental } from "@/features/rental/context/RentalContext";
import { useReturnRental } from "@/features/rental/services/useReturnRental";
import { getRentalEquipmentLabel } from "@/features/rental/utils/rentalFormOptions";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { canUseLegacyRentalMutations, REMOTE_RENTAL_MUTATION_UNAVAILABLE_MESSAGE } from "@/features/rental/services/rentalRuntimeCapability";

export default function ReturnRental() {
  const { configuration } = useApplicationDependenciesCompatibility();
  const mutationsAvailable = canUseLegacyRentalMutations(configuration);
  const navigate = useNavigate();
  const { id } = useParams();
  const { rentals, rentalEquipmentLines, returnRentalEquipmentLine } = useRental();
  const { equipment } = useEquipment();
  const { returnEquipment } = useReturnRental();
  const { showToast } = useToast();
  const [confirming, setConfirming] = useState(false);

  const rental = rentals.find((item) => item.id === id);
  const machine = equipment.find(
    (item) => item.id === rental?.equipmentId
  );
  const lines = rentalEquipmentLines.filter((line) => line.rentalId === rental?.id);

  function handleLineReturn(lineId: string) {
    if (!rental) return;
    const result = returnRentalEquipmentLine(rental.id, lineId);
    showToast(result.success ? "Equipment Line returned successfully." : result.message ?? "Unable to return Equipment Line.", result.success ? "success" : "error");
  }

  function handleReturn() {
    if (!rental) return;

    const result = returnEquipment(rental.id);

    if (!result.success) {
      showToast(result.message ?? "Unable to return equipment.", "error");
      setConfirming(false);
      return;
    }

    showToast(result.message ?? "Equipment returned successfully.", "success");
    navigate("/rentals");
  }

  if (!rental) {
    return <div className="p-8">Rental not found.</div>;
  }

  if (!mutationsAvailable) {
    return <div className="p-8"><h1 className="text-2xl font-bold">Rental return unavailable</h1><p className="mt-4 rounded border border-amber-200 bg-amber-50 p-4 text-amber-900">{REMOTE_RENTAL_MUTATION_UNAVAILABLE_MESSAGE}</p></div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold">Return Rental Equipment</h1>

        <p className="mt-2 text-slate-500">
          Confirm the equipment return to complete the operational return step.
        </p>
      </div>

      {lines.length > 1 && <section className="space-y-3 rounded-xl border bg-white p-6">
        <h2 className="text-lg font-semibold">Return Equipment Line</h2>
        {lines.map((line) => {
          const item = equipment.find((record) => record.id === line.equipmentId);
          return <div className="flex items-center justify-between gap-3 border-t pt-3" key={line.id}>
            <div><p className="font-medium">{getRentalEquipmentLabel(item)}</p><p className="text-xs text-slate-500">{line.id} · {line.status}</p></div>
            <Button disabled={!["Released", "Active"].includes(line.status)} onClick={() => handleLineReturn(line.id)}>Return Equipment Line</Button>
          </div>;
        })}
      </section>}

      <div className="space-y-3 rounded-xl border bg-white p-6">
        <Detail
          label="Equipment"
          value={getRentalEquipmentLabel(machine)}
        />
        <Detail label="Customer" value={rental.customer} />
        <Detail label="Project" value={rental.project || "-"} />
        <Detail label="Rental status" value={rental.status} />
        <Detail label="Expected return" value={rental.expectedReturn ?? "Not specified"} />
      </div>

      <div className="flex gap-3">
        <Button onClick={() => setConfirming(true)}>
          Return All Equipment
        </Button>

        <Button variant="secondary" onClick={() => navigate("/rentals")}>
          Cancel
        </Button>
      </div>

      <ConfirmModal
        open={confirming}
        title="Confirm return of all equipment"
        message="This explicit return-all action will mark the Rental returned and return every included Equipment Line."
        confirmText="Return All Equipment"
        onConfirm={handleReturn}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-6">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
