import type { CanonicalAssignmentData } from "@/features/assignment/hooks/useCanonicalAssignmentData";
import type { AssignmentRecord } from "@/features/assignment/types";
import { getAssignmentNumber } from "@/features/assignment/utils/assignmentDisplay";

export interface AssignmentBookingFilters { query: string; equipmentId: string; operatorId: string; customerId: string; projectId: string; status: string; dateFrom: string; dateTo: string }
export const emptyAssignmentBookingFilters = (): AssignmentBookingFilters => ({ query: "", equipmentId: "", operatorId: "", customerId: "", projectId: "", status: "", dateFrom: "", dateTo: "" });
export function filterCanonicalAssignmentBookings(data: CanonicalAssignmentData, filters: AssignmentBookingFilters, today: string): AssignmentRecord[] {
  const query = filters.query.trim().toLowerCase();
  return data.assignments.filter((item) => {
    const equipment = data.equipment.find((record) => record.id === item.equipmentId);
    const operator = data.operators.find((record) => record.id === item.operatorId);
    const project = data.projects.find((record) => record.id === item.projectId);
    const customerId = item.customerId ?? project?.customerId;
    const customer = data.customers.find((record) => record.id === customerId);
    const status = item.status === "Active" && item.expectedReturn && item.expectedReturn.slice(0, 10) < today && !item.returnedDate ? "Overdue" : item.status;
    if (filters.equipmentId && item.equipmentId !== filters.equipmentId) return false;
    if (filters.operatorId && item.operatorId !== filters.operatorId) return false;
    if (filters.customerId && customerId !== filters.customerId) return false;
    if (filters.projectId && item.projectId !== filters.projectId) return false;
    if (filters.status && status !== filters.status) return false;
    if (filters.dateFrom && (item.expectedReturn ?? item.assignedDate).slice(0, 10) < filters.dateFrom) return false;
    if (filters.dateTo && item.assignedDate.slice(0, 10) > filters.dateTo) return false;
    return !query || `${getAssignmentNumber(item.id, data.assignments)} ${equipment?.assetNo ?? ""} ${equipment?.equipmentName ?? ""} ${operator?.name ?? ""} ${project?.name ?? ""} ${customer?.name ?? ""}`.toLowerCase().includes(query);
  });
}
