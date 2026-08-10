import type { Permission } from "../domain/permission";
import type { User } from "../domain/user";

export interface OperatorPersonaRecord { readonly id: string; readonly status: string }
export interface OperatorPersonaDirectory { getById(id: string): OperatorPersonaRecord | undefined }

const OPERATOR_PERSONA_PERMISSIONS: ReadonlySet<Permission> = new Set(["deur.read", "deur.create"]);

export class OperatorPersonaAccessPolicy {
  constructor(private readonly operators?: OperatorPersonaDirectory) {}
  isOperatorPersona(user: User | null | undefined): boolean {
    if (!user || user.status !== "active" || !user.operatorId || !this.operators) return false;
    return this.operators.getById(user.operatorId)?.status === "Active";
  }
  permits(user: User | null | undefined, permission: Permission): boolean {
    return !this.isOperatorPersona(user) || OPERATOR_PERSONA_PERMISSIONS.has(permission);
  }
}
