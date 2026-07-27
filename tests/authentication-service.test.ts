import { describe, expect, it } from "vitest";

import type { AuthSession } from "@/features/auth/domain/session";
import type { User } from "@/features/auth/domain/user";
import type {
  AuthRepository,
  LoginCredentials,
} from "@/features/auth/repository/AuthRepository";
import type { UserRepository } from "@/features/auth/repository/UserRepository";
import { AuthenticationService } from "@/features/auth/services/AuthenticationService";
import { LocalAuthenticationProvider } from "@/features/auth/providers/local/LocalAuthenticationProvider";

const activeUser: User = {
  id: "user-1",
  username: "administrator",
  displayName: "Administrator",
  systemRoles: ["system-administrator"],
  status: "active",
  createdAt: "2026-07-28T00:00:00.000Z",
  updatedAt: "2026-07-28T00:00:00.000Z",
};
const session: AuthSession = {
  id: "session-1",
  userId: activeUser.id,
  providerId: "local",
  createdAt: "2026-07-28T00:00:00.000Z",
};

class FakeUsers implements UserRepository {
  constructor(public records: User[] = [activeUser]) {}
  getUsers() { return this.records; }
  getUserById(id: string) { return this.records.find((user) => user.id === id); }
  getUserByUsername(username: string) { return this.records.find((user) => user.username === username); }
  createUser(user: User) { this.records.push(user); return user; }
  updateUser(user: User) { this.records = this.records.map((item) => item.id === user.id ? user : item); return user; }
  activateUser(id: string) { return this.setStatus(id, "active"); }
  deactivateUser(id: string) { return this.setStatus(id, "inactive"); }
  private setStatus(id: string, status: User["status"]) {
    const user = this.getUserById(id);
    if (!user) throw new Error("missing");
    const updated = { ...user, status };
    return this.updateUser(updated);
  }
}

class FakeAuth implements AuthRepository {
  current: AuthSession | null = null;
  valid = true;
  login(_credentials: LoginCredentials) { this.current = this.valid ? session : null; return this.current; }
  logout() { this.current = null; }
  getCurrentSession() { return this.current; }
  restoreSession() { return this.current; }
  persistSession(value: AuthSession) { this.current = value; }
  clearSession() { this.current = null; }
}

function service(auth = new FakeAuth(), users = new FakeUsers()) {
  return new AuthenticationService(
    [new LocalAuthenticationProvider(auth, users)],
    users,
  );
}

const request = (password: string) => ({
  providerId: "local",
  payload: { username: "administrator", password },
});

describe("AuthenticationService", () => {
  it("logs in with valid credentials and resolves the current user", () => {
    const result = service().login(request("valid"));
    expect(result).toMatchObject({ success: true, session, user: activeUser });
  });

  it("rejects invalid credentials", () => {
    const auth = new FakeAuth();
    auth.valid = false;
    expect(service(auth).login(request("wrong")))
      .toMatchObject({ success: false, reason: "INVALID_CREDENTIALS" });
  });

  it("rejects inactive users before creating a session", () => {
    const users = new FakeUsers([{ ...activeUser, status: "inactive" }]);
    expect(service(new FakeAuth(), users).login(request("valid")))
      .toMatchObject({ success: false, reason: "INACTIVE_USER" });
  });

  it("restores a session and resolves its user", () => {
    const auth = new FakeAuth();
    auth.current = session;
    expect(service(auth).initialize())
      .toEqual({ session, user: activeUser });
  });

  it("returns anonymous initialization state without a session", () => {
    expect(service().initialize())
      .toEqual({ session: null, user: null });
  });

  it("rejects and clears a session whose user is missing", () => {
    const auth = new FakeAuth();
    auth.current = session;
    expect(service(auth, new FakeUsers([])).initialize())
      .toEqual({ session: null, user: null });
    expect(auth.current).toBeNull();
  });

  it("logs out through the repository", () => {
    const auth = new FakeAuth();
    auth.current = session;
    service(auth).logout();
    expect(auth.current).toBeNull();
  });

  it("rejects providers that are not registered", () => {
    expect(service().login({ providerId: "google", payload: {} }))
      .toMatchObject({ success: false, reason: "PROVIDER_UNAVAILABLE" });
  });
});
