import type { User } from "@/features/auth/domain/user";
import type { SystemRole } from "@/features/auth/domain/systemRole";
import type { UserRepository } from "@/features/auth/repository/UserRepository";
import { authorizationService as defaultAuthorizationService, type AuthorizationService } from "@/features/auth/services/AuthorizationService";
import { AuthorizationError } from "@/features/auth/services/AuthorizationError";
import { notifyCanonicalUserChanged } from "@/features/auth/services/canonicalUserChangeNotifications";
import type { Operator } from "@/features/operators/types";
import { isValidBusinessEmail, normalizeBusinessEmail } from "@/shared/validation/email";

export interface LocalUserProvisioner {
  create(user: User, initialPassword: string): User;
  replacePassword?(userId: string, newPassword: string): User;
}

export interface OperatorLinkDirectory {
  getById(id: string): Operator | undefined;
}

export interface CreateUserInput {
  readonly username: string;
  readonly displayName: string;
  readonly email?: string;
  readonly systemRoles: readonly SystemRole[];
  readonly initialPassword: string;
  readonly operatorId?: string;
}

export interface ResetLocalPasswordInput {
  readonly newPassword: string;
  readonly confirmNewPassword: string;
}

export class UserManagementService {
  constructor(
    private readonly users: UserRepository,
    private readonly localProvisioner: LocalUserProvisioner,
    private readonly createId: () => string = () => crypto.randomUUID(),
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly operators?: OperatorLinkDirectory,
    private readonly authorization: AuthorizationService = defaultAuthorizationService,
    private readonly notifyUserChanged: (userId: string) => void = notifyCanonicalUserChanged,
  ) {}

  list(actor: User): readonly User[] {
    this.authorize(actor);
    return this.users.getUsers();
  }

  search(actor: User, query: string): readonly User[] {
    const normalized = query.trim().toLocaleLowerCase();
    return this.list(actor).filter((user) =>
      `${user.username} ${user.displayName}`.toLocaleLowerCase().includes(normalized),
    );
  }

  create(actor: User, input: CreateUserInput): User {
    this.authorize(actor);
    if (!input.initialPassword) throw new Error("An initial local password is required.");
    const timestamp = this.now();
    const candidate: User = {
      id: this.createId(),
      username: input.username.trim(),
      displayName: input.displayName.trim(),
      ...(input.email?.trim() ? { email: this.normalizeEmail(input.email) } : {}),
      systemRoles: [...new Set(input.systemRoles)],
      status: "active",
      ...(input.operatorId ? { operatorId: input.operatorId } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.validateOperatorLink(candidate);
    return this.localProvisioner.create(candidate, input.initialPassword);
  }

  update(
    actor: User,
    id: string,
    changes: Pick<User, "username" | "displayName" | "systemRoles"> & {
      readonly email?: string;
      readonly operatorId?: string;
    },
  ): User {
    this.authorize(actor);
    const existing = this.required(id);
    const next = {
      ...existing,
      username: changes.username.trim(),
      displayName: changes.displayName.trim(),
      email: changes.email?.trim() ? this.normalizeEmail(changes.email) : undefined,
      systemRoles: [...new Set(changes.systemRoles)],
      operatorId: changes.operatorId || undefined,
      updatedAt: this.now(),
    };
    if (
      actor.id === id &&
      existing.systemRoles.includes("system-administrator") &&
      !next.systemRoles.includes("system-administrator") &&
      this.activeAdministratorCount() <= 1
    ) {
      throw new Error("The final active System Administrator role cannot be removed.");
    }
    this.validateOperatorLink(next);
    const updated = this.users.updateUser(next);
    this.notifyUserChanged(updated.id);
    return updated;
  }

  activate(actor: User, id: string): User {
    this.authorize(actor);
    this.validateOperatorLink({ ...this.required(id), status: "active" });
    const updated = this.users.activateUser(id);
    this.notifyUserChanged(updated.id);
    return updated;
  }

  deactivate(actor: User, id: string): User {
    this.authorize(actor);
    if (actor.id === id) throw new Error("You cannot deactivate your own active account.");
    const existing = this.required(id);
    if (
      existing.systemRoles.includes("system-administrator") &&
      this.activeAdministratorCount() <= 1
    ) {
      throw new Error("The system must retain at least one active System Administrator.");
    }
    const updated = this.users.deactivateUser(id);
    this.notifyUserChanged(updated.id);
    return updated;
  }

  resetLocalPassword(actor: User, id: string, input: ResetLocalPasswordInput): User {
    this.authorize(actor);
    const existing = this.required(id);
    if (!this.localProvisioner.replacePassword) throw new Error("Password reset is unavailable because this user is not managed by the Local Authentication Provider.");
    if (input.newPassword !== input.confirmNewPassword) throw new Error("New Password and Confirm New Password do not match.");
    this.validateLocalPassword(input.newPassword);
    const updated = this.localProvisioner.replacePassword(existing.id, input.newPassword);
    if (updated.id !== existing.id || updated.username !== existing.username || updated.operatorId !== existing.operatorId || JSON.stringify(updated.systemRoles) !== JSON.stringify(existing.systemRoles)) {
      throw new Error("Local password replacement changed canonical user identity and was rejected.");
    }
    return updated;
  }

  private authorize(actor: User): void {
    if (!this.authorization.hasPermission(actor, "users.manage")) throw new AuthorizationError("users.manage");
  }

  private required(id: string): User {
    const user = this.users.getUserById(id);
    if (!user) throw new Error("User not found.");
    return user;
  }

  private activeAdministratorCount(): number {
    return this.users.getUsers().filter(
      (user) =>
        user.status === "active" &&
        user.systemRoles.includes("system-administrator"),
    ).length;
  }

  private validateOperatorLink(candidate: User): void {
    if (!candidate.operatorId) return;
    if (!candidate.systemRoles.includes("rental-operations")) throw new Error("Only a Rental Operations user can be linked to an Operator record.");
    if (this.operators) {
      const operator = this.operators.getById(candidate.operatorId);
      if (!operator || operator.status !== "Active") throw new Error("Select an active canonical Operator record.");
    }
    if (candidate.status === "active" && this.users.getUsers().some((user) => user.id !== candidate.id && user.status === "active" && user.operatorId === candidate.operatorId)) {
      throw new Error("This Operator is already linked to another active application user.");
    }
  }

  private normalizeEmail(value: string): string {
    if (!isValidBusinessEmail(value)) throw new Error("Enter a valid application-user email address.");
    return normalizeBusinessEmail(value);
  }

  private validateLocalPassword(value: string): void {
    if (value.length < 8 || !/[A-Za-z]/.test(value) || !/\d/.test(value)) {
      throw new Error("New Password must contain at least 8 characters, including a letter and a number.");
    }
  }
}
