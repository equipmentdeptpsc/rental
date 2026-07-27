import type { IStorageService } from "@/core/storage/IStorageService";
import { storage as defaultStorage } from "@/core/storage";
import type { User as LegacyUser } from "../user";
import { localUatUserId } from "../user";
import type { Role } from "../role";

const LEGACY_USER_KEY = "auth_user";
const LEGACY_TOKEN_KEY = "auth_token";

export class LegacyAuthCompatibilityRepository {
  constructor(private readonly storage: IStorageService = defaultStorage) {}

  getCurrentUser(): LegacyUser | null {
    try {
      const user = this.storage.get<LegacyUser>(LEGACY_USER_KEY);
      return user &&
        typeof user.id === "string" &&
        typeof user.name === "string" &&
        ["Admin", "Manager", "Operator"].includes(user.role)
        ? Object.freeze({ ...user })
        : null;
    } catch {
      return null;
    }
  }

  clear(): void {
    this.storage.remove(LEGACY_USER_KEY);
    this.storage.remove(LEGACY_TOKEN_KEY);
  }

  login(name: string, role: Role): LegacyUser {
    const user: LegacyUser = {
      id: localUatUserId(name, role),
      name,
      role,
    };
    this.storage.set(LEGACY_USER_KEY, user);
    this.storage.set(LEGACY_TOKEN_KEY, crypto.randomUUID());
    return Object.freeze(user);
  }
}
