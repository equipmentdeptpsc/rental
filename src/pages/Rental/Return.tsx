import { useNavigate, useParams } from "react-router-dom";

import Button from "@/components/ui/Button";

import { useRental } from "@/features/rental/context/RentalContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useAudit } from "@/features/equipment/audit/AuditContext";
import { useToast } from "@/components/ui/toast/ToastContext";

import type { EquipmentRecord } from "@/features/equipment/types";
import type { RentalRecord } from "@/features/rental/types";

export default function ReturnRental() {
  const { id } = useParams();

  const navigate = useNavigate();

  const { rentals, returnRental } = useRental();

  const { equipment, updateEquipment } =
    useEquipment();

  const { logAction } = useAudit();

  const { showToast } = useToast();

  const foundRental = rentals.find(
    (r) => r.id === id
  );

  if (!foundRental) {
    return (
      <div className="p-8">
        Rental not found.
      </div>
    );
  }

  // Force TypeScript to treat this as non-null.
  const rental: RentalRecord = foundRental;

  function handleReturn() {
    returnRental(rental.id);

    const machine = equipment.find(
      (e) => e.id === rental.equipmentId
    );

    if (machine) {
      const updated: EquipmentRecord = {
        ...machine,
        status: "Available",
        project: "",
        operator: "",
      };

      updateEquipment(updated);

      logAction({
        action: "UPDATE",
        equipmentId: machine.id,
        before: machine,
        after: updated,
      });
    }

    showToast(
      "Equipment returned successfully",
      "success"
    );

    navigate("/rentals");
  }

  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="mb-6 text-2xl font-bold">
        Return Equipment
      </h1>

      <div className="space-y-2 rounded border p-6">
        <p>
          <strong>Customer:</strong>{" "}
          {rental.customer}
        </p>

        <p>
          <strong>Project:</strong>{" "}
          {rental.project}
        </p>

        <p>
          <strong>Date Out:</strong>{" "}
          {rental.dateOut}
        </p>

        <p>
          <strong>Expected Return:</strong>{" "}
          {rental.expectedReturn}
        </p>
      </div>

      <div className="mt-6 flex gap-3">
        <Button onClick={handleReturn}>
          Confirm Return
        </Button>

        <Button
          type="button"
          onClick={() => navigate("/rentals")}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}