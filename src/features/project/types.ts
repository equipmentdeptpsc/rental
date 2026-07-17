export type ProjectStatus =
  | "Planning"
  | "Active"
  | "Completed"
  | "On Hold";

export interface ProjectRecord {
  id: string;

  projectCode: string;

  projectName: string;

  client: string;

  location: string;

  projectManager: string;

  startDate?: string;

  targetCompletion?: string;

  status: ProjectStatus;

  deleted?: boolean;

  deletedAt?: number;
}
