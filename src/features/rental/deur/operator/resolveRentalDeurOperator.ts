import type { Operator } from "@/features/operators/types";
import type { RentalRecord } from "@/features/rental/types";

/**
 * The Rental owns the immutable operator identity used by its DEUR workflow.
 * Assignment changes after Rental creation must not rewrite transaction history.
 */
export function resolveRentalDeurOperator(
  rental: Pick<RentalRecord, "operatorId">,
  operators: Operator[],
): Operator | undefined {
  if (!rental.operatorId) return undefined;
  return operators.find((operator) => operator.id === rental.operatorId);
}
