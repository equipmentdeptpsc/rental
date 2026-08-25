import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import Sidebar from "@/app/Sidebar";
import {
  ApplicationDependencyProvider,
  createLocalApplicationDependencies,
} from "@/app/composition";
import { AuthProvider } from "@/features/auth/AuthContext";
import type { AuthSession } from "@/features/auth/domain/session";
import type { User } from "@/features/auth/domain/user";
import type { RemoteAuthenticationProvider } from "@/features/auth/providers/RemoteAuthenticationProvider";
import { AuthorizationService } from "@/features/auth/services/AuthorizationService";
import { APP_NAVIGATION_GROUPS } from "@/app/navigation/navigationConfig";
import canonicalMatrix from "../docs/rbac/role-permission-matrix.json";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];
const session: AuthSession = { id: "session", userId: "user", providerId: "remote", createdAt: "" };
const user = (role: User["systemRoles"][number], operatorId?: string): User => ({
  id: "user",
  username: role,
  displayName: role,
  systemRoles: [role],
  status: "active",
  operatorId,
  createdAt: "",
  updatedAt: "",
});

function canonicalPermissions(role: keyof typeof canonicalMatrix.grants): readonly string[] {
  const grant = canonicalMatrix.grants[role];
  if ("allPermissions" in grant) {
    return APP_NAVIGATION_GROUPS.flatMap(group => group.items.map(item => item.permission));
  }
  return [
    ...Object.entries(grant.standard).flatMap(([resource, actions]) =>
      (actions as readonly string[]).map(action => `${resource}.${action}`)),
    ...grant.workflow,
  ];
}

async function renderSidebar(currentUser: User, permissions?: readonly string[], collapsed = false, mobileOpen = true) {
  const dependencies = createLocalApplicationDependencies();
  if (currentUser.operatorId) {
    dependencies.authentication.authorizationService = new AuthorizationService({
      getById: (id) => ({ id, status: "Active" }),
    });
  }
  if (permissions) {
    const identity = { session, user: currentUser, permissions };
    dependencies.authentication.remoteAuthenticationProvider = {
      id: "remote",
      login: async () => ({ success: true, value: identity }),
      logout: async () => ({ success: true, value: undefined }),
      restoreSession: async () => ({ success: true, value: identity }),
      refreshSession: async () => ({ success: true, value: identity }),
      getCurrentUser: async () => ({ success: true, value: currentUser }),
    } satisfies RemoteAuthenticationProvider;
  } else {
    dependencies.authentication.authenticationService.initialize = () => ({ session, user: currentUser });
  }
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  await act(async () => root.render(createElement(
    ApplicationDependencyProvider,
    { dependencies },
    createElement(AuthProvider, null, createElement(
      MemoryRouter,
      null,
      createElement(Sidebar, { collapsed, mobileOpen, onToggle: () => undefined, onNavigate: () => undefined }),
    )),
  )));
  return container;
}

afterEach(async () => {
  for (const item of mounted.splice(0)) {
    await act(async () => item.root.unmount());
    item.container.remove();
  }
});

describe("Sidebar effective-permission projection", () => {
  it("shows every authorized navigation item to the remote Catalog 2.0 System Administrator", async () => {
    const permissions = [...new Set(APP_NAVIGATION_GROUPS.flatMap(group => group.items.map(item => item.permission)))];
    const container = await renderSidebar(user("system-administrator"), permissions);
    for (const item of APP_NAVIGATION_GROUPS.flatMap(group => group.items)) {
      expect(container.querySelector(`a[href="${item.path}"]`), item.label).not.toBeNull();
    }
  });

  it("shows Operations Manager only navigation authorized by its 28 canonical permissions", async () => {
    const permissions = canonicalPermissions("operations-manager");
    expect(permissions).toHaveLength(28);
    const container = await renderSidebar(user("operations-manager"), permissions);
    expect(container.querySelector('a[href="/reports"]')).not.toBeNull();
    expect(container.querySelector('a[href="/rentals"]')).not.toBeNull();
    for (const path of ["/users", "/roles", "/permissions", "/settings", "/billing"]) {
      expect(container.querySelector(`a[href="${path}"]`), path).toBeNull();
    }
  });

  it("does not infer System administration from Billing Staff financial access", async () => {
    const container = await renderSidebar(user("billing-staff"), canonicalPermissions("billing-staff"));
    expect(container.querySelector('a[href="/billing"]')).not.toBeNull();
    for (const path of ["/users", "/roles", "/permissions", "/settings"]) {
      expect(container.querySelector(`a[href="${path}"]`), path).toBeNull();
    }
  });

  it("shows a remote Finance user only destinations in the remote effective set", async () => {
    const container = await renderSidebar(user("finance"), ["billing.read"]);
    expect(container.querySelector('a[href="/billing"]')).not.toBeNull();
    expect(container.querySelector('a[href="/equipment"]')).toBeNull();
    expect(container.querySelector('a[href="/rentals"]')).toBeNull();
  });

  it("preserves effective authority for an existing deprecated compatibility-role membership", async () => {
    const container = await renderSidebar(user("rental-operations"), ["rental.read", "reports.read"]);
    expect(container.querySelector('a[href="/rentals"]')).not.toBeNull();
    expect(container.querySelector('a[href="/reports"]')).not.toBeNull();
    expect(container.querySelector('a[href="/users"]')).toBeNull();
  });

  it("does not special-case a remote System Administrator role", async () => {
    const container = await renderSidebar(user("system-administrator"), ["dashboard.read"], true, false);
    expect(container.querySelector('a[href="/dashboard"]')).not.toBeNull();
    expect(container.querySelector('a[href="/settings"]')).toBeNull();
    expect(container.querySelector("aside")?.className).toContain("md:w-[68px]");
    expect(container.querySelector("aside")?.className).toContain("-translate-x-full");
  });

  it("keeps remote Operator navigation scoped to My Shift", async () => {
    const container = await renderSidebar(user("rental-operations", "operator-1"), ["deur.read"]);
    expect(container.querySelectorAll("nav a")).toHaveLength(1);
    expect(container.querySelector('a[href="/operator"]')?.textContent).toContain("My Shift");
  });

  it("preserves local role-derived navigation", async () => {
    const container = await renderSidebar(user("finance"));
    expect(container.querySelector('a[href="/billing"]')).not.toBeNull();
    expect(container.querySelector('a[href="/equipment"]')).not.toBeNull();
    expect(container.querySelector('a[href="/settings"]')).toBeNull();
  });
});
