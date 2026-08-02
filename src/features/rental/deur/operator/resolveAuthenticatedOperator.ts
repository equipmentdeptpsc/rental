import type { User } from "@/features/auth/domain/user";
import type { Operator } from "@/features/operators/types";
import { resolveOperatorUserLink } from "@/features/operators/operatorUserLink";

export function resolveAuthenticatedOperator(
  user: (Pick<User, "operatorId"> & { readonly id?: string; readonly name?: string; readonly role?: string }) | undefined,
  operators: readonly Operator[],
) {
  if (!user?.operatorId) {
    if (user?.role === "Operator" && user.id) return resolveOperatorUserLink(user.id, [...operators]);
    return {
      status: "NOT_LINKED" as const,
      message: "Your user account is not linked to an Operator record. Ask an administrator to update your user account.",
    };
  }
  const operator = operators.find((record) => record.id === user.operatorId);
  if (!operator) {
    return {
      status: "MAPPED_OPERATOR_MISSING" as const,
      message: "The Operator linked to your user account is unavailable. Ask an administrator to correct your user account.",
    };
  }
  if (operator.status !== "Active") {
    return {
      status: "LINKED_OPERATOR_INACTIVE" as const,
      message: "The Operator linked to your user account is unavailable. Ask an administrator to correct your user account.",
    };
  }
  return { status: "RESOLVED" as const, operator };
}
