import { describe, expect, it } from "vitest";

import type { IStorageService } from "@/core/storage/IStorageService";
import type { AuthSession } from "@/features/auth/domain/session";
import type { User } from "@/features/auth/domain/user";
import { LocalAuthRepository } from "@/features/auth/repository/LocalAuthRepository";
import {
  DEFAULT_LOCAL_SEED_USERS,
  LocalUserRepository,
} from "@/features/auth/repository/LocalUserRepository";
import {
  AUTH_SESSION_STORAGE_KEY,
  AUTH_STORAGE_VERSION,
  AUTH_USERS_STORAGE_KEY,
} from "@/features/auth/repository/localStorageSchema";

const CORRUPT = Symbol("corrupt");

class MemoryStorage implements IStorageService {
  readonly values = new Map<string, unknown>();

  get<T>(key: string): T | null {
    const value = this.values.get(key);
    if (value === CORRUPT) throw new SyntaxError("Corrupt JSON");
    return value === undefined ? null : structuredClone(value) as T;
  }

  set<T>(key: string, value: T): void {
    this.values.set(key, structuredClone(value));
  }

  remove(key: string): void {
    this.values.delete(key);
  }

  clear(): void {
    this.values.clear();
  }
}

function sampleUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-custom",
    username: "custom.user",
    displayName: "Custom User",
    systemRoles: ["management"],
    status: "active",
    createdAt: "2026-07-28T01:00:00.000Z",
    updatedAt: "2026-07-28T01:00:00.000Z",
    ...overrides,
  };
}

function seededRepositories(storage = new MemoryStorage()) {
  const users = new LocalUserRepository(storage);
  users.initializeSeedUsers();
  const auth = new LocalAuthRepository(storage, users, {
    createId: () => "session-1",
    now: () => new Date("2026-07-28T02:00:00.000Z"),
  });
  return { storage, users, auth };
}

describe("LocalUserRepository", () => {
  it("returns empty users from empty storage before initialization", () => {
    const repository = new LocalUserRepository(new MemoryStorage());

    expect(repository.getUsers()).toEqual([]);
  });

  it("persists and retrieves users by ID and normalized username", () => {
    const repository = new LocalUserRepository(new MemoryStorage());
    const created = repository.createUser(sampleUser(), "LocalPassword!");

    expect(repository.getUserById(created.id)).toEqual(created);
    expect(repository.getUserByUsername("  CUSTOM.USER ")).toEqual(created);
    expect(repository.getUsers()).toEqual([created]);
  });

  it("creates exactly four seed users with the approved roles", () => {
    const storage = new MemoryStorage();
    const repository = new LocalUserRepository(storage);

    const users = repository.initializeSeedUsers();

    expect(users).toHaveLength(4);
    expect(users.map((user) => user.displayName)).toEqual([
      "Administrator",
      "Rental Operations",
      "Finance",
      "Management",
    ]);
    expect(users.map((user) => user.systemRoles[0])).toEqual([
      "system-administrator",
      "rental-operations",
      "finance",
      "management",
    ]);
  });

  it("stores users in a version 1 envelope", () => {
    const { storage } = seededRepositories();
    const envelope = storage.values.get(AUTH_USERS_STORAGE_KEY) as {
      schemaVersion: number;
      records: unknown[];
    };

    expect(AUTH_USERS_STORAGE_KEY).toBe("equipment-rental.auth.v1.users");
    expect(envelope.schemaVersion).toBe(AUTH_STORAGE_VERSION);
    expect(envelope.records).toHaveLength(4);
  });

  it("does not overwrite existing user storage during seed initialization", () => {
    const storage = new MemoryStorage();
    const repository = new LocalUserRepository(storage);
    repository.createUser(sampleUser(), "ExistingPassword!");
    const before = structuredClone(storage.values.get(AUTH_USERS_STORAGE_KEY));

    expect(repository.initializeSeedUsers()).toHaveLength(1);
    expect(storage.values.get(AUTH_USERS_STORAGE_KEY)).toEqual(before);
  });

  it("leaves corrupt storage untouched and does not seed over it", () => {
    const storage = new MemoryStorage();
    storage.values.set(AUTH_USERS_STORAGE_KEY, CORRUPT);
    const repository = new LocalUserRepository(storage);

    expect(repository.getUsers()).toEqual([]);
    expect(repository.initializeSeedUsers()).toEqual([]);
    expect(storage.values.get(AUTH_USERS_STORAGE_KEY)).toBe(CORRUPT);
  });

  it("rejects duplicate usernames case-insensitively", () => {
    const repository = new LocalUserRepository(new MemoryStorage());
    repository.createUser(sampleUser(), "FirstPassword!");

    expect(() =>
      repository.createUser(
        sampleUser({ id: "user-2", username: "CUSTOM.USER" }),
        "SecondPassword!",
      ),
    ).toThrow("Username already exists");
  });

  it("activates and deactivates users", () => {
    const repository = new LocalUserRepository(new MemoryStorage());
    repository.createUser(sampleUser(), "LocalPassword!");

    expect(repository.deactivateUser("user-custom").status).toBe("inactive");
    expect(repository.getUserById("user-custom")?.status).toBe("inactive");
    expect(repository.activateUser("user-custom").status).toBe("active");
  });

  it("migrates a recognized unversioned user array under the new key", () => {
    const storage = new MemoryStorage();
    storage.values.set(AUTH_USERS_STORAGE_KEY, [
      { user: sampleUser(), localPassword: "LegacyLocalPassword!" },
    ]);
    const repository = new LocalUserRepository(storage);

    expect(repository.getUsers()).toHaveLength(1);
    expect(storage.values.get(AUTH_USERS_STORAGE_KEY)).toMatchObject({
      schemaVersion: 1,
      records: [{ localPassword: "LegacyLocalPassword!" }],
    });
  });

  it("returns immutable user snapshots without mutating persisted records", () => {
    const { storage, users } = seededRepositories();
    const snapshots = users.getUsers();
    const administrator = snapshots[0];

    expect(Object.isFrozen(snapshots)).toBe(true);
    expect(Object.isFrozen(administrator)).toBe(true);
    expect(Object.isFrozen(administrator.systemRoles)).toBe(true);
    expect(() => {
      (administrator as { displayName: string }).displayName = "Changed";
    }).toThrow();
    expect(users.getUserById(administrator.id)?.displayName).toBe("Administrator");
    expect(storage.values.get(AUTH_USERS_STORAGE_KEY)).toBeDefined();
  });
});

describe("LocalAuthRepository", () => {
  it("persists and restores a local session", () => {
    const { storage, auth } = seededRepositories();

    const session = auth.login({
      username: "finance",
      password: DEFAULT_LOCAL_SEED_USERS[2].localPassword,
    });

    expect(session).toEqual({
      id: "session-1",
      userId: "local-user-finance",
      providerId: "local",
      createdAt: "2026-07-28T02:00:00.000Z",
    });
    expect(AUTH_SESSION_STORAGE_KEY).toBe("equipment-rental.auth.v1.session");
    expect(storage.values.get(AUTH_SESSION_STORAGE_KEY)).toMatchObject({
      schemaVersion: 1,
      session,
    });
    expect(auth.restoreSession()).toEqual(session);
  });

  it("rejects invalid credentials and inactive users", () => {
    const { users, auth } = seededRepositories();

    expect(auth.login({ username: "finance", password: "wrong" })).toBeNull();
    users.deactivateUser("local-user-finance");
    expect(
      auth.login({
        username: "finance",
        password: DEFAULT_LOCAL_SEED_USERS[2].localPassword,
      }),
    ).toBeNull();
  });

  it("removes sessions on logout and clearSession", () => {
    const { storage, auth } = seededRepositories();
    const session: AuthSession = {
      id: "manual-session",
      userId: "local-user-management",
      providerId: "local",
      createdAt: "2026-07-28T02:00:00.000Z",
    };

    auth.persistSession(session);
    auth.logout();
    expect(auth.getCurrentSession()).toBeNull();
    expect(storage.values.has(AUTH_SESSION_STORAGE_KEY)).toBe(false);

    auth.persistSession(session);
    auth.clearSession();
    expect(storage.values.has(AUTH_SESSION_STORAGE_KEY)).toBe(false);
  });

  it("treats corrupt sessions as unavailable without overwriting them", () => {
    const { storage, auth } = seededRepositories();
    storage.values.set(AUTH_SESSION_STORAGE_KEY, CORRUPT);

    expect(auth.getCurrentSession()).toBeNull();
    expect(storage.values.get(AUTH_SESSION_STORAGE_KEY)).toBe(CORRUPT);
  });

  it("migrates a recognized unversioned session under the new key", () => {
    const { storage, auth } = seededRepositories();
    const session: AuthSession = {
      id: "legacy-session",
      userId: "local-user-management",
      providerId: "local",
      createdAt: "2026-07-28T01:00:00.000Z",
    };
    storage.values.set(AUTH_SESSION_STORAGE_KEY, session);

    expect(auth.getCurrentSession()).toEqual(session);
    expect(storage.values.get(AUTH_SESSION_STORAGE_KEY)).toEqual({
      schemaVersion: 1,
      session,
    });
  });

  it("clears sessions that cannot be restored", () => {
    const { storage, users, auth } = seededRepositories();
    auth.persistSession({
      id: "inactive-session",
      userId: "local-user-management",
      providerId: "local",
      createdAt: "2026-07-28T01:00:00.000Z",
    });
    users.deactivateUser("local-user-management");

    expect(auth.restoreSession()).toBeNull();
    expect(storage.values.has(AUTH_SESSION_STORAGE_KEY)).toBe(false);
  });

  it("preserves legacy authentication keys", () => {
    const { storage, users, auth } = seededRepositories();
    storage.values.set("auth_user", { id: "legacy-user" });
    storage.values.set("auth_token", "legacy-token");

    users.initializeSeedUsers();
    auth.clearSession();

    expect(storage.values.get("auth_user")).toEqual({ id: "legacy-user" });
    expect(storage.values.get("auth_token")).toBe("legacy-token");
  });
});
