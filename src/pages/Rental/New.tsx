import { useNavigate } from "react-router-dom";

import RentalForm from "@/features/rental/components/RentalForm";

import { useRental } from "@/features/rental/context/RentalContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useAudit } from "@/features/equipment/audit/AuditContext";
import { useToast } from "@/components/ui/toast/ToastContext";

import type { RentalRecord } from "@/features/rental/types";

export default function NewRental() {
  const navigate = useNavigate();

  const { addRental } = useRental();
  const { equipment, updateEquipment } = useEquipment();
  const { logAction } = useAudit();
  const { showToast } = useToast();

  function handleSubmit(data: any) {
    const selected = equipment.find(
      (e) => e.id === data.equipmentId
    );

    if (!selected) {
      showToast("Equipment not found", "error");
      return;
    }

    if (selected.status !== "Available") {
      showToast("Equipment is not available", "error");
      return;
    }

    const rental: RentalRecord = {
      id: crypto.randomUUID(),
      equipmentId: data.equipmentId,
      customer: data.customer,
      project: data.project,
      rentedBy: data.rentedBy,
      dateOut: new Date().toISOString().split("T")[0],
      expectedReturn: data.expectedReturn,
      status: "Active",
    };

    addRental(rental);

    const updatedEquipment = {
      ...selected,
      status: "Assigned" as const,
      project: data.project,
      operator: data.rentedBy,
    };

    updateEquipment(updatedEquipment);

    logAction({
      action: "UPDATE",
      equipmentId: selected.id,
      before: selected,
      after: updatedEquipment,
    });

    showToast("Rental created successfully", "success");

    navigate("/rentals");
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">
        New Rental
      </h1>

      <RentalForm onSubmit={handleSubmit} />
    </div>
  );
}