export type AssignmentCreateField = 'equipmentId' | 'operatorId' | 'customerId' | 'projectId' | 'assignedDate' | 'expectedReturn';

/** Presentation mapping only; the canonical create command remains authoritative. */
export function assignmentCreateFieldErrors(code: string): Partial<Record<AssignmentCreateField, string>> {
  switch (code) {
    case 'ASSIGNMENT_START_DATE_IN_PAST': return { assignedDate: 'Choose today or a future Philippine business date.' };
    case 'CUSTOMER_PROJECT_MISMATCH': return { projectId: 'Choose an active Project belonging to this Customer.' };
    case 'EQUIPMENT_UNAVAILABLE':
    case 'EQUIPMENT_INTERVAL_CONFLICT': return { equipmentId: 'This Equipment is unavailable for the requested dates.' };
    case 'OPERATOR_ALREADY_ASSIGNED': return { operatorId: 'This Operator already has an active Assignment.' };
    default: return {};
  }
}
