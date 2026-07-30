import { describe, expect, it } from "vitest";

import {
  APP_NAVIGATION_GROUPS,
  getAuthorizedLandingPage,
  getVisibleNavigation,
} from "@/app/navigation/navigationConfig";
import type { User } from "@/features/auth/domain/user";
import { AuthorizationService } from "@/features/auth/services/AuthorizationService";
import { getSafeReturnTo } from "@/features/auth/routing/safeReturnTo";
import { PUBLIC_ROUTE_PATTERNS, router } from "@/app/router";

const authorization = new AuthorizationService();
const user = (role: User["systemRoles"][number]): User => ({
  id: role,
  username: role,
  displayName: role,
  systemRoles: [role],
  status: "active",
  createdAt: "",
  updatedAt: "",
});
const labels = (role: User["systemRoles"][number]) =>
  getVisibleNavigation(user(role), authorization)
    .flatMap((group) => group.items)
    .map((item) => item.label);

describe("safe return-to validation", () => {
  it.each(["/rentals/1?tab=deur", "/equipment", "/reports#summary"])(
    "accepts internal path %s",
    (path) => expect(getSafeReturnTo(path)).toBe(path),
  );

  it.each([
    "https://evil.example",
    "//evil.example/path",
    "javascript:alert(1)",
    "/%2F%2Fevil.example",
    "/login",
    "/login?returnTo=/",
    "/bad%value",
    "/\\evil",
  ])("rejects unsafe or looping return-to value %s", (path) => {
    expect(getSafeReturnTo(path)).toBeNull();
  });
});

describe("public route inventory", () => {
  it("keeps only login and the approved external token workflows public", () => {
    expect(PUBLIC_ROUTE_PATTERNS).toEqual([
      "/login",
      "/rental-approval/:token",
      "/customer-deur-review/:deurId",
      "/review/deur/completed",
      "/review/manager/completed",
      "/review/deur/:credential",
      "/review/manager/:credential",
    ]);
    expect(router.routes.slice(0, PUBLIC_ROUTE_PATTERNS.length).map((route) => route.path)).toEqual(
      PUBLIC_ROUTE_PATTERNS,
    );
    expect(router.routes[PUBLIC_ROUTE_PATTERNS.length].path).toBe("/");
  });
});

describe("permission-aware navigation", () => {
  it("keeps metadata ordering stable and removes empty groups", () => {
    const visible = getVisibleNavigation(user("finance"), authorization);
    const sourceOrder = APP_NAVIGATION_GROUPS.flatMap((group) => group.items.map((item) => item.label));
    const visibleLabels = visible.flatMap((group) => group.items.map((item) => item.label));
    expect(visible.every((group) => group.items.length > 0)).toBe(true);
    expect(visibleLabels).toEqual(sourceOrder.filter((label) => visibleLabels.includes(label)));
  });

  it("shows every module to System Administrator", () => {
    expect(labels("system-administrator")).toHaveLength(
      APP_NAVIGATION_GROUPS.flatMap((group) => group.items).length,
    );
  });

  it("shows read-only modules but not Settings to Management", () => {
    expect(labels("management")).toEqual([
      "Dashboard", "Equipment", "Assignments", "Rentals", "Maintenance",
      "Operators", "Projects", "Daily Logs", "Customers", "Billing", "Reports",
    ]);
  });

  it("shows finance and supporting read modules to Finance", () => {
    expect(labels("finance")).toContain("Billing");
    expect(labels("finance")).toContain("Rentals");
    expect(labels("finance")).not.toContain("Maintenance");
    expect(labels("finance")).not.toContain("Settings");
  });

  it("shows operational modules to Rental Operations without Settings", () => {
    expect(labels("rental-operations")).toContain("Maintenance");
    expect(labels("rental-operations")).toContain("Billing");
    expect(labels("rental-operations")).not.toContain("Settings");
  });

  it("selects deterministic authorized landing pages", () => {
    expect(getAuthorizedLandingPage(user("system-administrator"), authorization)).toBe("/dashboard");
    expect(getAuthorizedLandingPage(user("management"), authorization)).toBe("/dashboard");
    expect(getAuthorizedLandingPage(user("finance"), authorization)).toBe("/billing");
    expect(getAuthorizedLandingPage(user("rental-operations"), authorization)).toBe("/rentals");
    expect(getAuthorizedLandingPage(
      { ...user("rental-operations"), operatorId: "operator-1" },
      authorization,
      { hasActiveOperatorLink: true },
    )).toBe("/operator");
    expect(getAuthorizedLandingPage(
      { ...user("rental-operations"), operatorId: "operator-1" },
      authorization,
      { hasActiveOperatorLink: false },
    )).toBe("/rentals");
    expect(getAuthorizedLandingPage({ ...user("finance"), status: "inactive" }, authorization)).toBeNull();
  });
});
