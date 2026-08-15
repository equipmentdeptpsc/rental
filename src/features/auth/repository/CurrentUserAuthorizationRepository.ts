import type { RepositoryResult } from "@/core/persistence";
import type { Permission } from "../domain/permission";
import type { User } from "../domain/user";

export interface CurrentUserAuthorizationRepository {
  getCurrentUserProfile(): Promise<RepositoryResult<User>>;
  getCurrentUserEffectivePermissions(): Promise<RepositoryResult<readonly Permission[]>>;
  getCurrentUserRoles(): Promise<RepositoryResult<readonly string[]>>;
}
