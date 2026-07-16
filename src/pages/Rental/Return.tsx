import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import Button from "@/components/ui/Button";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/toast/ToastContext";

import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useRental } from "@/features/rental/context/RentalContext";
import { useReturnRental } from "@/features/rental/services/useReturnRental";
import { getRentalEquipmentLabel } from "@/features/rental/utils/rentalFormOptions";

export default function ReturnRental() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { rentals } = useRental();
  const { equipment } = useEquipment();
  const { returnEquipment } = useReturnRental();
  const { showToast } = useToast();
  const [confirming, setConfirming] = useState(false);

  const rental = rentals.find((item) => item.id === id);
  const machine = equipment.find(
    (item) => item.id === rental?.equipmentId
  );

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

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-bold">Return Rental Equipment</h1>

        <p className="mt-2 text-slate-500">
          Confirm the equipment return to complete the operational return step.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border bg-white p-6">
        <Detail
          label="Equipment"
          value={getRentalEquipmentLabel(machine)}
        />
        <Detail label="Customer" value={rental.customer} />
        <Detail label="Project" value={rental.project || "-"} />
        <Detail label="Rental status" value={rental.status} />
        <Detail label="Expected return" value={rental.expectedReturn} />
      </div>

      <div className="flex gap-3">
        <Button onClick={() => setConfirming(true)}>
          Return Equipment
        </Button>

        <Button variant="secondary" onClick={() => navigate("/rentals")}>
          Cancel
        </Button>
      </div>

      <ConfirmModal
        open={confirming}
        title="Confirm equipment return"
        message="This will mark the rental as returned and restore the equipment to Available."
        confirmText="Return Equipment"
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
