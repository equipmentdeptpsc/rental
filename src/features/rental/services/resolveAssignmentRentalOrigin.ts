import type { AssignmentRecord } from "@/features/assignment/types";
import type { CustomerRecord } from "@/features/customer/types";
import type { ProjectRecord } from "@/features/project/types";

export type AssignmentRentalOrigin =
  | { success: true; assignment: AssignmentRecord; project: ProjectRecord; customer: CustomerRecord }
  | { success: false; message: string };

export function resolveAssignmentRentalOrigin(
  assignment: AssignmentRecord,
  projects: ProjectRecord[],
  customers: CustomerRecord[],
): AssignmentRentalOrigin {
  if (assignment.deleted || assignment.status !== "Active") return { success: false, message: "The selected Assignment is not active." };
  if (!assignment.projectId) return { success: false, message: "The selected Assignment does not have a canonical Project." };
  const project = projects.find((item) => item.id === assignment.projectId);
  if (!project || project.deleted) return { success: false, message: "The Assignment's canonical Project could not be found." };
  if (project.status !== "Active") return { success: false, message: "The Assignment's canonical Project is inactive." };
  if (!project.customerId) return { success: false, message: "The Assignment's canonical Project does not have a Customer." };
  const customer = customers.find((item) => item.id === project.customerId);
  if (!customer) return { success: false, message: "The Project's canonical Customer could not be found." };
  if (!customer.active) return { success: false, message: "The Project's canonical Customer is inactive." };
  return { success: true, assignment, project, customer };
}
