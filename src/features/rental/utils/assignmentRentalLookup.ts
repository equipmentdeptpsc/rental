import type { AssignmentRecord } from "@/features/assignment/types";

export type AssignmentLookupResult =
  | { state: "none" | "loading" }
  | { state: "malformed" | "missing" | "ineligible"; message: string }
  | { state: "found"; assignment: AssignmentRecord };

export function assignmentRentalUrl(assignmentId: string) {
  return `/rentals/new?assignment=${encodeURIComponent(assignmentId)}`;
}

export function resolveAssignmentRentalLookup(value: string | null, assignments: AssignmentRecord[], sourceLoading: boolean): AssignmentLookupResult {
  if (value === null) return { state: "none" };
  let id: string;
  try { id = decodeURIComponent(value).trim(); } catch { return { state: "malformed", message: "The assignment link is invalid." }; }
  if (!id) return { state: "malformed", message: "The assignment link is invalid." };
  if (sourceLoading) return { state: "loading" };
  const assignment = assignments.find((item) => item.id === id);
  if (!assignment || assignment.deleted) return { state: "missing", message: "The selected assignment could not be found." };
  if (assignment.status !== "Active") return { state: "ineligible", message: "The selected assignment is no longer eligible." };
  return { state: "found", assignment };
}
