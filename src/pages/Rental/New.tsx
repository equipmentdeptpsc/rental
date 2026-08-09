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
import { useCustomer } from "@/features/customer/context/CustomerContext";

import { generateRentalNumber } from "@/features/rental/utils/generateRentalNumber";
import {
  getAssignmentProjectError,
  getRentalAssignmentPrefill,
} from "@/features/rental/utils/rentalFormOptions";
import { resolveAssignmentRentalLookup } from "@/features/rental/utils/assignmentRentalLookup";
import { isValidBusinessEmail, normalizeBusinessEmail } from "@/shared/validation/email";

export default function NewRental() {
  const navigate =
    useNavigate();

  const [searchParams] =
    useSearchParams();

  const assignmentQuery = searchParams.get("assignment");

  const equipmentParam =
    searchParams.get(
      "equipment"
    );

  const {
    assignments,
  } = useAssignment();

  const assignmentLookup = resolveAssignmentRentalLookup(assignmentQuery, assignments);
  const assignment = assignmentLookup.state === "found" ? assignmentLookup.assignment : undefined;

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
  const {customers}=useCustomer();
  const assignmentProjectError = getAssignmentProjectError(assignment, projects);

    const {
    showToast,
  } = useToast();

  function handleSubmit(
    data: RentalFormData
  ) {
    const selectedProject = projects.find((project) => project.id === data.projectId);
    const selectedCustomer=customers.find(customer=>customer.id===data.customerId);
    if(!selectedCustomer||!data.customerRepresentativeName?.trim()||!data.customerReviewEmail||!isValidBusinessEmail(data.customerReviewEmail)){showToast("A valid rental-specific Customer representative and review email are required.","error");return}
    if (!selectedProject || selectedProject.customerId !== data.customerId) {
      showToast("The selected Project must belong to the selected Customer.", "error");
      return;
    }
    const rentalId =
      crypto.randomUUID();

      
      const selectedAssignments = data.assignmentIds.map((id) => assignments.find((item) => item.id === id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
      const lineInputs = selectedAssignments.length
        ? selectedAssignments.map((item) => ({ equipmentId: item.equipmentId, operatorId: item.operatorId, assignmentId: item.id }))
        : [{ equipmentId: data.equipmentId, operatorId: data.operatorId, assignmentId: assignmentPrefill.assignmentId }];
      const soleLine = lineInputs.length === 1 ? lineInputs[0] : undefined;

      const rental = {
        id: rentalId,

        rentalNumber: generateRentalNumber(rentals),
      
        equipmentId:
          soleLine?.equipmentId ?? "",

        customerId: data.customerId,
        customerContactSnapshot:{representativeName:data.customerRepresentativeName.trim(),representativeEmail:normalizeBusinessEmail(data.customerReviewEmail),contactNumber:selectedCustomer.contactNumber,capturedAt:new Date().toISOString()},

        projectId: data.projectId,

        operatorId: soleLine?.operatorId,

        assignmentId: soleLine?.assignmentId,
      
        customer:
          data.customer,
      
        project: selectedProject.projectName,
      
        rentedBy:
          "",
      
        dateOut: data.dateOut,
      
        expectedReturn:
          data.expectedReturn,

        rentalType: data.rentalType || undefined,

        billingMethod: data.billingMethod || undefined,

        deurExpectationPolicyRequired: true,

        deurExpectationPolicy: {
          frequency: data.deurExpectationFrequency,
          effectiveFrom: data.dateOut,
          ...(data.deurExpectationFrequency === "PER_SHIFT" ? { expectedShiftCodes: data.expectedShiftCodes } : {}),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          capturedAt: new Date().toISOString(),
        },
      
      };

    const result = addRental(rental, lineInputs);

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
      `/rentals/${rentalId}/commercial-terms`
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

      {assignmentLookup.state === "loading" ? <p className="text-slate-500">Loading assignment…</p> : "message" in assignmentLookup ? <p className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">{assignmentLookup.message}</p> : <RentalForm
        onSubmit={
          handleSubmit
        }
        initialEquipmentId={
          initialEquipmentId ||
          undefined
        }
        initialProjectId={assignmentPrefill.projectId}
        initialOperatorId={assignmentPrefill.operatorId}
        lockEquipment={Boolean(assignment)}
        lockOperator={Boolean(assignment)}
        initialProjectWarning={assignmentProjectError}
        assignment={assignment}
        initialAssignmentIds={assignment ? [assignment.id] : []}
      />}

    </div>
  );
}
