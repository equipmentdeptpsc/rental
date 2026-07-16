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
import { useProject } from "@/features/project/context/ProjectContext";

import { generateRentalNumber } from "@/features/rental/utils/generateRentalNumber";
import { getRentalAssignmentPrefill } from "@/features/rental/utils/rentalFormOptions";

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

  const assignmentPrefill = getRentalAssignmentPrefill(assignment);

  const {
    addRental,
    rentals,
  } = useRental();

  const { projects } = useProject();

    const {
    showToast,
  } = useToast();

  function handleSubmit(
    data: RentalFormData
  ) {
    const rentalId =
      crypto.randomUUID();

      
      const rental = {
        id: rentalId,

        rentalNumber: generateRentalNumber(rentals),
      
        equipmentId:
          data.equipmentId,

        customerId: data.customerId,

        projectId: data.projectId,

        operatorId: assignmentPrefill.operatorId,

        assignmentId: assignmentPrefill.assignmentId,
      
        customer:
          data.customer,
      
        project:
          projects.find((project) => project.id === data.projectId)?.projectName ?? "",
      
        rentedBy:
          "",
      
        dateOut:
          new Date()
            .toISOString()
            .split("T")[0],
      
        expectedReturn:
          data.expectedReturn,
      
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
        initialProjectId={assignmentPrefill.projectId}
        lockEquipment={Boolean(assignment)}
        lockProject={Boolean(assignment)}
      />

    </div>
  );
}
