import type { User } from "@/features/auth/domain/user";
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
export interface UserDeletionReferenceInspector { hasBusinessReferences(user:User):boolean;hasBlockingAuditHistory(user:User):boolean }

export interface CreateUserInput {
  readonly username: string;
  readonly displayName: string;
  readonly email?: string;
  readonly systemRoles: readonly string[];
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
    private readonly audit?: { record(event:{actor:User;targetId:string;action:string;beforeRoles?:readonly string[];afterRoles?:readonly string[];metadata?:Record<string,string>}):void },
    private readonly deletionReferences?:UserDeletionReferenceInspector,
  ) {}

  list(actor: User): readonly User[] {
    this.authorize(actor);
    return this.users.getUsers();
  }

  search(actor: User, query: string): readonly User[] {
    const normalized = query.trim().toLocaleLowerCase();
    return this.list(actor).filter((user) =>
      `${user.username} ${user.displayName} ${user.email??""} ${user.systemRoles.join(" ")}`.toLocaleLowerCase().includes(normalized),
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
      ...(actor.companyId ? { companyId: actor.companyId } : {}),
      ...(input.operatorId ? { operatorId: input.operatorId } : {}),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.validateUniqueIdentity(candidate);
    this.validateOperatorLink(candidate);
    const created=this.localProvisioner.create(candidate, input.initialPassword);
    this.audit?.record({actor,targetId:created.id,action:"USER_CREATED",afterRoles:created.systemRoles});
    return created;
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
    this.validateUniqueIdentity(next);
    this.validateOperatorLink(next);
    const updated = this.users.updateUser(next);
    this.audit?.record({actor,targetId:updated.id,action:"USER_UPDATED",beforeRoles:existing.systemRoles,afterRoles:updated.systemRoles});
    for(const role of updated.systemRoles.filter(role=>!existing.systemRoles.includes(role)))this.audit?.record({actor,targetId:updated.id,action:"USER_ROLE_ASSIGNED",beforeRoles:existing.systemRoles,afterRoles:updated.systemRoles,metadata:{role}});
    for(const role of existing.systemRoles.filter(role=>!updated.systemRoles.includes(role)))this.audit?.record({actor,targetId:updated.id,action:"USER_ROLE_REMOVED",beforeRoles:existing.systemRoles,afterRoles:updated.systemRoles,metadata:{role}});
    if(existing.operatorId!==updated.operatorId)this.audit?.record({actor,targetId:updated.id,action:updated.operatorId?"USER_OPERATOR_LINKED":"USER_OPERATOR_UNLINKED",metadata:updated.operatorId?{operatorId:updated.operatorId}:{}});
    this.notifyUserChanged(updated.id);
    return updated;
  }

  activate(actor: User, id: string): User {
    this.authorize(actor);
    this.validateOperatorLink({ ...this.required(id), status: "active" });
    const updated = this.users.activateUser(id);
    this.audit?.record({actor,targetId:updated.id,action:"USER_ACTIVATED",afterRoles:updated.systemRoles});
    this.notifyUserChanged(updated.id);
    return updated;
  }

  deactivate(actor: User, id: string): User {
    this.authorize(actor);
    if (actor.id === id) throw new Error("You cannot deactivate your own active account.");
    const existing = this.required(id);
    if (existing.systemRoles.includes("system-administrator")) {
      throw new Error("System Administrator deactivation requires the protected governance flow.");
    }
    const updated = this.users.deactivateUser(id);
    this.audit?.record({actor,targetId:updated.id,action:"USER_DEACTIVATED",afterRoles:updated.systemRoles});
    this.notifyUserChanged(updated.id);
    return updated;
  }

  delete(actor:User,id:string):void{this.authorize(actor);const existing=this.required(id);if(actor.id===id)throw new Error("You cannot delete your own signed-in account. Deactivate another account instead.");if(existing.status==="active"&&existing.systemRoles.includes("system-administrator")&&this.activeAdministratorCount()<=1)throw new Error("The system must retain at least one active System Administrator. Deactivate another account instead.");if(this.deletionReferences?.hasBusinessReferences(existing)||this.deletionReferences?.hasBlockingAuditHistory(existing))throw new Error("User cannot be deleted because business or audit history exists. Deactivate the account instead.");if(!this.users.deleteUser)throw new Error("User deletion is unavailable for this user repository. Deactivate the account instead.");this.users.deleteUser(id);this.audit?.record({actor,targetId:id,action:"USER_DELETED",beforeRoles:existing.systemRoles,metadata:{username:existing.username}});this.notifyUserChanged(id)}

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
    this.audit?.record({actor,targetId:updated.id,action:"USER_ACCESS_RESET"});
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
    if (!candidate.systemRoles.includes("operator") && !candidate.systemRoles.includes("rental-operations")) throw new Error("Only a Rental Operations or canonical Operator role user can be linked to an Operator record.");
    if (this.operators) {
      const operator = this.operators.getById(candidate.operatorId);
      if (!operator || operator.status !== "Active") throw new Error("Select an active canonical Operator record.");
    }
    if (candidate.status === "active" && this.users.getUsers().some((user) => user.id !== candidate.id && user.status === "active" && user.operatorId === candidate.operatorId)) {
      throw new Error("This Operator is already linked to another active application user.");
    }
  }

  private validateUniqueIdentity(candidate: User): void {
    const companyId=candidate.companyId;
    const duplicateUsername=this.users.getUsers().find(user=>user.id!==candidate.id&&user.companyId===companyId&&user.username.trim().toLocaleLowerCase()===candidate.username.trim().toLocaleLowerCase());
    if(duplicateUsername)throw new Error("Username already exists.");
    if(!candidate.email)return;
    const email=normalizeBusinessEmail(candidate.email);
    const duplicateEmail=this.users.getUsers().find(user=>user.id!==candidate.id&&user.companyId===companyId&&user.email&&normalizeBusinessEmail(user.email)===email);
    if(duplicateEmail)throw new Error(`Email already exists. This email is assigned to ${duplicateEmail.displayName} (${duplicateEmail.username}). Edit the existing user and assign additional roles instead.`);
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
