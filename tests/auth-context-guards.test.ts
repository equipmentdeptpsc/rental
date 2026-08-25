import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import {
  ApplicationDependencyProvider,
  createLocalApplicationDependencies,
  type ApplicationDependencies,
} from "@/app/composition";
import { AuthProvider, useAuth, type AuthContextType } from "@/features/auth/AuthContext";
import type { AuthSession } from "@/features/auth/domain/session";
import type { User } from "@/features/auth/domain/user";
import RequireAuthentication from "@/features/auth/guards/RequireAuthentication";
import RequirePermission from "@/features/auth/guards/RequirePermission";
import type { LoginResult } from "@/features/auth/services/AuthenticationService";
import Header from "@/app/Header";

const administrator: User = {
  id: "admin",
  username: "administrator",
  displayName: "Administrator",
  systemRoles: ["system-administrator"],
  status: "active",
  createdAt: "",
  updatedAt: "",
};
const management: User = {
  ...administrator,
  id: "manager",
  username: "management",
  displayName: "Management",
  systemRoles: ["management"],
};
const session: AuthSession = {
  id: "session",
  userId: "admin",
  providerId: "local",
  createdAt: "",
};

class FakeAuthenticationService {
  state: { session: AuthSession | null; user: User | null } = {
    session: null,
    user: null,
  };
  nextLogin: LoginResult = { success: true, session, user: administrator };
  initialize() { return this.state; }
  login() { return this.nextLogin; }
  logout() { this.state = { session: null, user: null }; }
}

let roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(async () => {
  for (const item of roots) {
    await act(async () => item.root.unmount());
    item.container.remove();
  }
  roots = [];
  localStorage.clear();
});

function dependencies(service: FakeAuthenticationService): ApplicationDependencies {
  const result = createLocalApplicationDependencies();
  return {
    ...result,
    authentication: {
      ...result.authentication,
      authenticationService: service as unknown as typeof result.authentication.authenticationService,
      legacyCompatibilityRepository: {
        getCurrentUser: () => null,
        clear: () => undefined,
        login: () => ({ id: "legacy", name: "Legacy", role: "Admin" }),
      } as unknown as typeof result.authentication.legacyCompatibilityRepository,
    },
  };
}

async function render(
  service: FakeAuthenticationService,
  child: ReactNode,
  initialEntry = "/",
) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push({ root, container });
  await act(async () => {
    root.render(createElement(
      ApplicationDependencyProvider,
      { dependencies: dependencies(service) },
      createElement(
        AuthProvider,
        null,
        createElement(MemoryRouter, { initialEntries: [initialEntry] }, child),
      ),
    ));
  });
  return { container };
}

function Location() {
  const location = useLocation();
  return createElement("span", { "data-location": true }, location.pathname + location.search);
}

describe("AuthContext integration", () => {
  it.each([
    ["operations-manager", "Operations Manager"],
    ["system-administrator", "System Administrator"],
    ["operator", "Operator"],
    ["billing-staff", "Billing Officer"],
    ["read-only-auditor", "Auditor"],
    ["custom-unavailable", "Assigned User"],
  ])("renders canonical header label %s as %s", async (role, label) => {
    const service = new FakeAuthenticationService();
    service.state = {
      session,
      user: { ...administrator, displayName: "Role Label User", systemRoles: [role] },
    };
    const { container } = await render(
      service,
      createElement(Header, { onMenu: () => undefined }),
    );
    expect(container.textContent).toContain(`Role Label User (${label})`);
    if (role === "operations-manager") expect(container.textContent).not.toContain("Role Label User (Operator)");
  });

  it("restores authenticated state and exposes compatibility fields", async () => {
    const service = new FakeAuthenticationService();
    service.state = { session, user: administrator };
    let value: AuthContextType | undefined;
    function Harness() { value = useAuth(); return null; }
    await render(service, createElement(Harness));

    expect(value?.isInitializing).toBe(false);
    expect(value?.isAuthenticated).toBe(true);
    expect(value?.session).toEqual(session);
    expect(value?.user).toMatchObject({ displayName: "Administrator", name: "Administrator", role: "Admin" });
    expect(value?.token).toBe("session");
  });

  it("supports anonymous, login, and logout state updates", async () => {
    const service = new FakeAuthenticationService();
    let value: AuthContextType | undefined;
    function Harness() { value = useAuth(); return null; }
    await render(service, createElement(Harness));
    expect(value?.isAuthenticated).toBe(false);

    await act(async () => {
      await value?.login({ username: "administrator", password: "password" });
    });
    expect(value?.isAuthenticated).toBe(true);
    expect(value?.user?.displayName).toBe("Administrator");

    act(() => value?.logout());
    expect(value?.isAuthenticated).toBe(false);
  });
});

describe("route guards", () => {
  it("redirects anonymous protected access with a safe encoded return-to", async () => {
    const { container } = await render(
      new FakeAuthenticationService(),
      createElement(
        Routes,
        null,
        createElement(Route, { path: "/login", element: createElement(Location) }),
        createElement(Route, {
          path: "/equipment",
          element: createElement(
            RequireAuthentication,
            null,
            createElement("div", null, "Equipment"),
          ),
        }),
      ),
      "/equipment?view=list",
    );
    expect(container.querySelector("[data-location]")?.textContent)
      .toBe("/login?returnTo=%2Fequipment%3Fview%3Dlist");
  });

  it("allows authenticated permitted routes and denies missing permissions", async () => {
    const adminService = new FakeAuthenticationService();
    adminService.state = { session, user: administrator };
    const admin = await render(
      adminService,
      createElement(
        RequireAuthentication,
        null,
        createElement(
          RequirePermission,
          {
            permission: "settings.manage",
            children: createElement("div", null, "Settings"),
          },
        ),
      ),
    );
    expect(admin.container.textContent).toContain("Settings");

    const managementService = new FakeAuthenticationService();
    managementService.state = { session: { ...session, userId: management.id }, user: management };
    const denied = await render(
      managementService,
      createElement(
        RequireAuthentication,
        null,
        createElement(
          RequirePermission,
          {
            permission: "settings.manage",
            children: createElement("div", null, "Settings"),
          },
        ),
      ),
    );
    expect(denied.container.textContent).toContain("Access Denied");
  });

  it("keeps an authorized deep route during canonical session restoration", async () => {
    const service = new FakeAuthenticationService();
    service.state = { session, user: administrator };
    const { container } = await render(
      service,
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: "/rentals/:id/workspace",
          element: createElement(
            RequireAuthentication,
            null,
            createElement("div", null, "Restored rental workspace"),
          ),
        }),
      ),
      "/rentals/rental-1/workspace",
    );
    expect(container.textContent).toContain("Restored rental workspace");
  });

  it("uses replace logout navigation so Back cannot reveal protected content or a stale target", async () => {
    const service = new FakeAuthenticationService();
    service.state = { session, user: administrator };
    function LoginWithBack() {
      const navigate = useNavigate();
      return createElement(
        "div",
        null,
        createElement(Location),
        createElement("button", { onClick: () => navigate(-1) }, "Back"),
      );
    }
    const { container } = await render(
      service,
      createElement(
        Routes,
        null,
        createElement(Route, { path: "/login", element: createElement(LoginWithBack) }),
        createElement(Route, {
          path: "/equipment",
          element: createElement(
            RequireAuthentication,
            null,
            createElement(Header, { onMenu: () => undefined }),
            createElement("div", null, "Protected equipment"),
          ),
        }),
      ),
      "/equipment",
    );
    expect(container.textContent).toContain("Protected equipment");
    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "Sign Out")
        ?.click();
    });
    expect(container.querySelector("[data-location]")?.textContent).toBe("/login");
    expect(container.textContent).not.toContain("Protected equipment");

    await act(async () => {
      [...container.querySelectorAll("button")]
        .find((button) => button.textContent === "Back")
        ?.click();
    });
    expect(container.textContent).not.toContain("Protected equipment");
    expect(container.querySelector("[data-location]")?.textContent).toBe("/login");
  });
});
