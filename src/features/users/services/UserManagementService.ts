import type { User } from "@/features/auth/domain/user";
import type { SystemRole } from "@/features/auth/domain/systemRole";
import type { UserRepository } from "@/features/auth/repository/UserRepository";
import { assertPermission } from "@/features/auth/services/assertPermission";
import type { Operator } from "@/features/operators/types";

export interface LocalUserProvisioner {
  create(user: User, initialPassword: string): User;
}

export interface OperatorLinkDirectory {
  getById(id: string): Operator | undefined;
}

export interface CreateUserInput {
  readonly username: string;
  readonly displayName: string;
  readonly systemRoles: readonly SystemRole[];
  readonly initialPassword: string;
  readonly operatorId?: string;
}

export class UserManagementService {
  constructor(
    private readonly users: UserRepository,
    private readonly localProvisioner: LocalUserProvisioner,
    private readonly createId: () => string = () => crypto.randomUUID(),
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly operators?: OperatorLinkDirectory,
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
      readonly operatorId?: string;
    },
  ): User {
    this.authorize(actor);
    const existing = this.required(id);
    const next = {
      ...existing,
      username: changes.username.trim(),
      displayName: changes.displayName.trim(),
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
    return this.users.updateUser(next);
  }

  activate(actor: User, id: string): User {
    this.authorize(actor);
    this.validateOperatorLink({ ...this.required(id), status: "active" });
    return this.users.activateUser(id);
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
    return this.users.deactivateUser(id);
  }

  private authorize(actor: User): void {
    assertPermission(actor, "users.manage");
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
}
