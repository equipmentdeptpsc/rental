import type { User } from "@/features/auth/user";
import type { Operator } from "@/features/operators/types";
import { resolveOperatorUserLink } from "@/features/operators/operatorUserLink";
export function resolveAuthenticatedOperator(user:User|undefined,operators:Operator[]){
  if(!user||user.role!=="Operator")return{status:"NOT_OPERATOR" as const};
  return resolveOperatorUserLink(user.id,operators);
}
