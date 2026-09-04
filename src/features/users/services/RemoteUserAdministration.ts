import type { User } from "@/features/auth/domain/user";
import type { Operator } from "@/features/operators/types";
import type { CreateUserInput } from "./UserManagementService";

export interface RemoteAssignableRole {
  readonly code: string;
  readonly name: string;
  readonly active: boolean;
  readonly deprecatedAt?: string;
  readonly catalogVersion?: string;
  readonly permissions: readonly string[];
}
export interface RemoteUserAdministration {
  listUsers(): Promise<readonly User[]>;
  listRoles(): Promise<readonly RemoteAssignableRole[]>;
  listOperators(): Promise<readonly Operator[]>;
  create(input: CreateUserInput & { commandId: string; idempotencyKey: string }): Promise<User>;
  deactivate(userId: string, commandId: string, idempotencyKey: string): Promise<User>;
  resetPassword(userId: string, newPassword: string, commandId: string, idempotencyKey: string): Promise<void>;
  resetOperatorPin(userId: string, newPin: string, confirmNewPin: string, commandId: string, idempotencyKey: string): Promise<void>;
}
