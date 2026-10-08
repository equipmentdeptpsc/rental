import { useEffect, useState } from "react";
import { useApplicationDependenciesCompatibility } from "@/app/composition";
import { loadRentalListPages } from "@/features/rental/hooks/useRentalListData";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line/types";
import type { RentalRecord } from "@/features/rental/types";
import { subscribeCanonicalRentalRefresh } from "@/features/rental/remote/canonicalRentalRefresh";

export type AssignmentRentalPreparation =
  | { kind: "loading" | "error" | "none" | "committed" }
  | { kind: "draft"; rental: RentalRecord; count: number };

export function classifyAssignmentRentalPreparation(
  assignmentId: string,
  rentals: readonly RentalRecord[],
  lines: readonly RentalEquipmentLine[],
): AssignmentRentalPreparation {
  const linked = rentals.filter((rental) => rental.assignmentId === assignmentId
    || lines.some((line) => line.rentalId === rental.id && line.assignmentId === assignmentId));
  const drafts: RentalRecord[] = [];
  for (const rental of linked) {
    const rentalLines = lines.filter((line) => line.rentalId === rental.id);
    const progressed = rental.approvalStatus === "Approved" || Boolean(
      rental.reservedAt || rental.releasedAt || rental.activatedAt || rental.returnedAt || rental.closedAt,
    );
    if (progressed) return { kind: "committed" };
    if (rental.status === "Cancelled" && rentalLines.every((line) => line.status === "Cancelled")) continue;
    if (rental.status !== "Draft" || rentalLines.some((line) => line.status !== "Draft")) return { kind: "committed" };
    drafts.push(rental);
  }
  return drafts.length ? { kind: "draft", rental: drafts[0], count: drafts.length } : { kind: "none" };
}

export function useAssignmentRentalPreparation(assignmentId?: string): AssignmentRentalPreparation {
  const { readRepositories } = useApplicationDependenciesCompatibility();
  const [state, setState] = useState<AssignmentRentalPreparation>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => subscribeCanonicalRentalRefresh(() => setAttempt((value) => value + 1)), []);
  useEffect(() => {
    if (!assignmentId) { setState({ kind: "none" }); return; }
    let active = true;
    setState({ kind: "loading" });
    void Promise.all([
      loadRentalListPages(readRepositories.rentals),
      loadRentalListPages(readRepositories.rentalEquipmentLines),
    ]).then(([rentals, lines]) => {
      if (!active) return;
      setState(rentals.success && lines.success
        ? classifyAssignmentRentalPreparation(assignmentId, rentals.value.items, lines.value.items)
        : { kind: "error" });
    }).catch(() => { if (active) setState({ kind: "error" }); });
    return () => { active = false; };
  }, [assignmentId, attempt, readRepositories]);
  return state;
}
