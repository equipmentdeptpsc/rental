import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import RentalForm from "@/features/rental/components/RentalForm";

import type {
  RentalFormData,
} from "@/features/rental/components/RentalForm";

import { useRental } from "@/features/rental/context/RentalContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useAudit } from "@/features/equipment/audit/AuditContext";
import { useToast } from "@/components/ui/toast/ToastContext";

import type { RentalRecord } from "@/features/rental/types";
import type { EquipmentRecord } from "@/features/equipment/types";

export default function NewRental() {
  const navigate =
    useNavigate();

  const [searchParams] =
    useSearchParams();

  const initialEquipmentId =
    searchParams.get(
      "equipment"
    ) ?? "";

  const { addRental } =
    useRental();

  const {
    equipment,
    updateEquipment,
  } = useEquipment();

  const { logAction } =
    useAudit();

  const { showToast } =
    useToast();

  function handleSubmit(
    data: RentalFormData
  ) {
    const selected =
      equipment.find(
        (e) =>
          e.id ===
          data.equipmentId
      );

    if (!selected) {
      showToast(
        "Equipment not found",
        "error"
      );

      return;
    }

    if (
      selected.status !==
      "Available"
    ) {
      showToast(
        "Equipment is not available",
        "error"
      );

      return;
    }

    const rental: RentalRecord =
      {
        id: crypto.randomUUID(),

        equipmentId:
          data.equipmentId,

        customer:
          data.customer,

        project:
          data.project,

        rentedBy:
          data.rentedBy,

        dateOut:
          new Date()
            .toISOString()
            .split("T")[0],

        expectedReturn:
          data.expectedReturn,

        status:
          "Active",
      };

    addRental(rental);

    const updatedEquipment: EquipmentRecord =
      {
        ...selected,

        projectId: "",

        operatorId: "",

        status:
          "Assigned",
      };

    updateEquipment(
      updatedEquipment
    );

    logAction({
      action: "UPDATE",

      equipmentId:
        selected.id,

      before:
        selected,

      after:
        updatedEquipment,
    });

    showToast(
      "Rental created successfully",
      "success"
    );

    navigate(
      "/rentals"
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6">

      <div>

        <h1 className="text-3xl font-bold">
          New Rental
        </h1>

        <p className="mt-2 text-gray-500">
          Create a rental transaction.
        </p>

      </div>

      <RentalForm
        onSubmit={
          handleSubmit
        }
        initialEquipmentId={
          initialEquipmentId ||
          undefined
        }
        lockEquipment={Boolean(
          initialEquipmentId
        )}
      />

    </div>
  );
}