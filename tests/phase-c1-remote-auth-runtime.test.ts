import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApplicationDependencyProvider, createLocalApplicationDependencies, PersistenceMode } from "@/app/composition";
import { AuthProvider, useAuth, type AuthContextType } from "@/features/auth/AuthContext";
import { repositoryFailure, repositorySuccess } from "@/core/persistence";
import type { User } from "@/features/auth/domain/user";

const user: User = {
  id: "00000000-0000-4000-8000-000000000001", username: "operator@example.com", displayName: "Remote Operator",
  systemRoles: ["rental-operations"], status: "active", operatorId: "operator-a",
  createdAt: "2026-07-29T00:00:00.000Z", updatedAt: "2026-07-29T00:00:00.000Z",
};
const identity = { user, permissions: ["deur.read", "deur.create", "deur.review"], session: { id: "remote-session", userId: user.id, providerId: "supabase", createdAt: "2026-07-29T00:00:00.000Z" } };
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => { if (root) await act(async () => root?.unmount()); root = undefined; });

describe("Phase C1 remote authentication runtime", () => {
  it("restores, logs in by email, retains Operator linkage, and revokes the remote session", async () => {
    const provider = {
      id: "supabase",
      restoreSession: vi.fn(async () => repositorySuccess<typeof identity | null>(null)),
      refreshSession: vi.fn(async () => repositorySuccess(identity)),
      login: vi.fn(async () => repositorySuccess(identity)),
      logout: vi.fn(async () => repositorySuccess(undefined)),
      getCurrentUser: vi.fn(async () => repositorySuccess(user)),
    };
    const dependencies = createLocalApplicationDependencies();
    dependencies.configuration.persistenceMode = PersistenceMode.Remote;
    dependencies.authentication.remoteAuthenticationProvider = provider;
    let auth: AuthContextType | undefined;
    function Probe() { auth = useAuth(); return null; }
    const container = document.createElement("div"); root = createRoot(container);
    await act(async () => root!.render(createElement(ApplicationDependencyProvider, { dependencies }, createElement(AuthProvider, null, createElement(Probe)))));
    expect(auth?.isAuthenticated).toBe(false);
    await act(async () => { await auth?.login({ username: "operator@example.com", password: "secret" }); });
    expect(provider.login).toHaveBeenCalledWith({ username: "operator@example.com", password: "secret" });
    expect(auth?.user).toMatchObject({ operatorId: "operator-a", systemRoles: ["rental-operations"] });
    act(() => auth?.logout());
    expect(provider.logout).toHaveBeenCalled();
    expect(auth?.isAuthenticated).toBe(false);
  });

  it("rejects a disabled or unavailable remote application User safely", async () => {
    const provider = {
      id: "supabase", restoreSession: vi.fn(async () => repositorySuccess(null)),
      refreshSession: vi.fn(async () => repositorySuccess(null)),
      login: vi.fn(async () => repositoryFailure("REMOTE_USER_UNAVAILABLE", "The authenticated application User is missing or inactive.", { recoverability: "USER_ACTION_REQUIRED", recommendedAction: "Contact an administrator." })),
      logout: vi.fn(async () => repositorySuccess(undefined)), getCurrentUser: vi.fn(async () => repositorySuccess(null)),
    };
    const dependencies = createLocalApplicationDependencies();
    dependencies.configuration.persistenceMode = PersistenceMode.Remote;
    dependencies.authentication.remoteAuthenticationProvider = provider;
    let auth: AuthContextType | undefined;
    function Probe() { auth = useAuth(); return null; }
    const container = document.createElement("div"); root = createRoot(container);
    await act(async () => root!.render(createElement(ApplicationDependencyProvider, { dependencies }, createElement(AuthProvider, null, createElement(Probe)))));
    let result;
    await act(async () => { result = await auth?.login({ username: "disabled@example.com", password: "secret" }); });
    expect(result).toMatchObject({ success: false, reason: "INVALID_CREDENTIALS", message: "Invalid username/email or password." });
    expect(auth?.isAuthenticated).toBe(false);
  });
});
