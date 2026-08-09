import type { RentalEquipmentLine } from "../equipment-line";
import type { RentalLifecycleStatus } from "../types";

/** Physical return aggregation is line-scoped and never produces financial Closed. */
export function resolveRentalStatusAfterLineReturn(lines: readonly RentalEquipmentLine[]): RentalLifecycleStatus {
  return lines.length > 0 && lines.every((line) => ["Returned", "Closed", "Cancelled"].includes(line.status))
    ? "Returned"
    : "Active";
}
