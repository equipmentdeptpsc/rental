import type { ProjectRecord } from "./types";

export const mockProjects: ProjectRecord[] = [
  {
    id: crypto.randomUUID(),
    projectCode: "PRJ-001",
    projectName: "Metro Line Extension",
    client: "ABC Construction",
    location: "Quezon City",
    projectManager: "John Reyes",
    startDate: "2026-01-10",
    targetCompletion: "2026-12-31",
    status: "Active",
  },
  {
    id: crypto.randomUUID(),
    projectCode: "PRJ-002",
    projectName: "North Highway",
    client: "DPWH",
    location: "Bulacan",
    projectManager: "Maria Santos",
    startDate: "2026-02-15",
    targetCompletion: "2027-01-30",
    status: "Planning",
  },
];