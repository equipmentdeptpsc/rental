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
import { useToast } from "@/components/ui/toast/ToastContext";

import type { RentalRecord } from "@/features/rental/types";
import { generateRentalNumber } from "@/features/rental/utils/generateRentalNumber";

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
    showToast,
  } = useToast();

  function handleSubmit(
    data: RentalFormData
  ) {
    const rentalId =
      crypto.randomUUID();

      
      const rental: RentalRecord = {
        id: rentalId,

        rentalNumber: generateRentalNumber(rentals),
      
        equipmentId:
          data.equipmentId,

        customerId: data.customerId,

        projectId: assignment?.projectId,

        operatorId: assignment?.operatorId,

        assignmentId: assignment?.id,
      
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

    const result = addRental(rental);

    if (!result.success) {
      showToast(
        result.message ??
          "Unable to create rental.",
        "error"
      );

      return;
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
