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

export function getRentalProjectOptions(projects: ProjectRecord[]) {
  return projects
    .filter((project) => !project.deleted && project.status === "Active")
    .map((project) => ({
      value: project.id,
      label: `${project.projectCode} - ${project.projectName}`,
    }));
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
