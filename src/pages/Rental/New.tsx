import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import RentalForm from "@/features/rental/components/RentalForm";

import type {
  RentalFormData,
} from "@/features/rental/components/RentalForm";

import { useRental } from "@/features/rental/context/RentalContext";
import { useAssignment } from "@/features/assignment/context/AssignmentContext";
import { useEquipment } from "@/features/equipment/context/EquipmentContext";
import { useAudit } from "@/features/equipment/audit/AuditContext";
import { useToast } from "@/components/ui/toast/ToastContext";
import { useEquipmentHistory,
} from "@/features/equipment/history";

import {
  rentalHistory,
} from "@/features/equipment/application";

import type { RentalRecord } from "@/features/rental/types";
import {
  assignEquipment,
} from "@/features/equipment/application";

import {
    auditRental,
} from "@/features/equipment/application";

import {
  canCreateRental,
} from "@/features/rental/services/AvailabilityService";

export default function NewRental() {
  const navigate =
    useNavigate();

  const [searchParams] =
    useSearchParams();

  const assignmentId =
    searchParams.get(
      "assignment"
    );

  const equipmentParam =
    searchParams.get(
      "equipment"
    );

  const {
    assignments,
    updateAssignment,
  } = useAssignment();

  const assignment =
    assignmentId
      ? assignments.find(
          (a) =>
            a.id ===
            assignmentId
        )
      : undefined;

  const initialEquipmentId =
    assignment?.equipmentId ??
    equipmentParam ??
    "";

    const {
      addRental,
      rentals,
    } = useRental();

  const {
    equipment,
    updateEquipment,
  } = useEquipment();

  const {
    logAction,
  } = useAudit();

    const {
    showToast,
  } = useToast();

  const { log } =
  useEquipmentHistory();

  function handleSubmit(
    data: RentalFormData
  ) {
    const selected =
      equipment.find(
        (e) =>
          e.id ===
          data.equipmentId
      );

      const availability =
  canCreateRental(
    selected,
    rentals
  );

if (!availability.success) {

  showToast(
    availability.message ??
      "Equipment is unavailable.",
    "error"
  );

  return;

}

    const rentalId =
      crypto.randomUUID();

      const rental: RentalRecord = {
        id: rentalId,
      
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
      
        statusId:
          data.statusId,
      
        status:
          data.status,
      };

    const result =
      addRental(
        rental,
        selected
      );

    if (!result.success) {
      showToast(
        result.message ??
          "Unable to create rental.",
        "error"
      );

      return;
    }

    if (!selected) {
      return;
    }

    const {
      equipment: updatedEquipment,
    } = assignEquipment(
      selected,
      assignment?.projectId ?? "",
      assignment?.operatorId ?? ""
    );
    
    updateEquipment(
      updatedEquipment
    );
    log(
      rentalHistory(
        selected.id
      )
    );

    logAction(
      auditRental(
        selected,
        updatedEquipment
      )
    );

    if (
      assignment &&
      assignment.status ===
        "Active"
    ) {
      updateAssignment({
        ...assignment,

        status:
          "Completed",

        returnedDate:
          new Date()
            .toISOString()
            .split("T")[0],
      });
    }

    showToast(
      "Rental created successfully",
      "success"
    );

    navigate(
      `/rentals/${rentalId}/workspace`
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">

      <div>

        <h1 className="text-3xl font-bold">
          New Rental
        </h1>

        <p className="mt-2 text-gray-500">

          {assignment
            ? "Rental is being created from an existing assignment."
            : "Create a rental transaction."}

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