import type { SupabaseClient } from "@supabase/supabase-js";
import { repositoryFailure, repositorySuccess, type RepositoryResult } from "@/core/persistence";
import type { ReadOnlyRepository } from "@/core/remote";
import type { Permission } from "@/features/auth/domain/permission";
import type { User } from "@/features/auth/domain/user";
import type { CurrentUserAuthorizationRepository } from "@/features/auth/repository/CurrentUserAuthorizationRepository";

export class SupabaseCurrentUserAuthorizationRepository implements CurrentUserAuthorizationRepository {
  constructor(
    private readonly client: SupabaseClient,
    private readonly users: ReadOnlyRepository<User>,
  ) {}

  async getCurrentUserProfile(): Promise<RepositoryResult<User>> {
    const identity = await this.client.auth.getUser();
    if (identity.error || !identity.data.user) return unavailable("Current application user profile is unavailable.");
    const profile = await this.users.getById(identity.data.user.id);
    if (!profile.success) return profile;
    return profile.value ? repositorySuccess(profile.value) : unavailable("Current application user profile is unavailable.");
  }

  async getCurrentUserEffectivePermissions(): Promise<RepositoryResult<readonly Permission[]>> {
    const response = await this.client.schema("erp").rpc("current_user_effective_permissions");
    if (response.error) return unavailable("Current effective permissions are unavailable.");
    const values = rows(response.data, "permission_code");
    return values ? repositorySuccess(values as Permission[]) : malformed("permission");
  }

  async getCurrentUserRoles(): Promise<RepositoryResult<readonly string[]>> {
    const response = await this.client.schema("erp").rpc("current_user_roles");
    if (response.error) return unavailable("Current assigned roles are unavailable.");
    const values = rows(response.data, "role_code");
    return values ? repositorySuccess(values) : malformed("role");
  }
}

function rows(value: unknown, field: string): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: string[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object" || typeof (row as Record<string, unknown>)[field] !== "string") return undefined;
    result.push((row as Record<string, string>)[field]);
  }
  return [...new Set(result)].sort();
}

function unavailable<T>(message: string): RepositoryResult<T> {
  return repositoryFailure("REMOTE_AUTHORIZATION_DENIED", message, {
    recoverability: "USER_ACTION_REQUIRED",
    recommendedAction: "Sign in again or ask an administrator to verify the application-user assignment.",
  });
}

function malformed<T>(kind: string): RepositoryResult<T> {
  return repositoryFailure("REMOTE_ROW_MALFORMED", `Current ${kind} projection is malformed.`, {
    recoverability: "MANUAL_RECONCILIATION",
    recommendedAction: "Verify the current-subject authorization projection.",
  });
}
