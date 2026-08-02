import type { User } from "@/features/auth/domain/user";
import type { Operator } from "@/features/operators/types";
import { resolveAuthenticatedOperator } from "./resolveAuthenticatedOperator";

export type OperatorAccountLineAccess =
  | { status: "RESOLVED"; operator: Operator }
  | { status: "ACCOUNT_LINK_REQUIRED" | "LINKED_OPERATOR_UNAVAILABLE" | "OWNERSHIP_MISMATCH"; message: string };

export function resolveOperatorAccountLineAccess(user: User | null | undefined, operators: readonly Operator[], lineOperatorId: string): OperatorAccountLineAccess {
  const identity = resolveAuthenticatedOperator(user ?? undefined, operators);
  if (identity.status === "NOT_LINKED") return { status: "ACCOUNT_LINK_REQUIRED", message: identity.message };
  if (identity.status === "MAPPED_OPERATOR_MISSING" || identity.status === "LINKED_OPERATOR_INACTIVE") return { status: "LINKED_OPERATOR_UNAVAILABLE", message: identity.message };
  if (identity.operator.id !== lineOperatorId) return { status: "OWNERSHIP_MISMATCH", message: "OWNERSHIP_MISMATCH: This equipment line is assigned to another operator." };
  return { status: "RESOLVED", operator: identity.operator };
}
