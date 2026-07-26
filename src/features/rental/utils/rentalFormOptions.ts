import type { User } from "@/features/auth/user";
import type { EquipmentRecord } from "@/features/equipment/types";
import type { ProjectRecord } from "@/features/project/types";
import type { AssignmentRecord } from "@/features/assignment/types";

export function getRentalEquipmentLabel(
  equipment: Pick<EquipmentRecord, "assetNo" | "equipmentName"> | undefined
): string {
  return equipment
    ? `${equipment.assetNo} - ${equipment.equipmentName}`
    : "Unknown equipment";
}

export function getRentalProjectOptions(projects: ProjectRecord[], customerId: string) {
  if (!customerId) return [];
  return projects
    .filter((project) => !project.deleted && project.status === "Active" && project.customerId === customerId)
    .map((project) => ({
      value: project.id,
      label: `${project.projectCode} - ${project.projectName}`,
    }));
}

export function getAssignmentProjectError(
  assignment: AssignmentRecord | undefined,
  projects: ProjectRecord[]
): string | undefined {
  if (!assignment) return undefined;
  if (!assignment.projectId) return "The assignment does not have a project.";

  const project = projects.find((candidate) => candidate.id === assignment.projectId);
  if (!project || project.deleted) return "The assignment's project could not be found.";
  if (project.status !== "Active") return "The assignment's project is inactive.";

  return undefined;
}

export function getRentalProjectLabel(project: ProjectRecord | undefined): string {
  return project
    ? `${project.projectCode} - ${project.projectName}`
    : "Unknown project";
}

export function selectAdminUsers(users: User[]): User[] {
  return users.filter((user) => user.role === "Admin");
}

export function getRentalAssignmentPrefill(
  assignment: AssignmentRecord | undefined
) {
  if (!assignment) {
    return {};
  }

  return {
    assignmentId: assignment.id,
    equipmentId: assignment.equipmentId,
    operatorId: assignment.operatorId,
    projectId: assignment.projectId,
  };
}
