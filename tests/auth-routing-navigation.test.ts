import { describe, expect, it } from "vitest";

import {
  APP_NAVIGATION_GROUPS,
  CANONICAL_NAVIGATION_PERMISSIONS,
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
      "/review/customer/grouped/:credential",
      "/review/manager/:credential",
    ]);
    expect(router.routes.slice(0, PUBLIC_ROUTE_PATTERNS.length).map((route) => route.path)).toEqual(
      PUBLIC_ROUTE_PATTERNS,
    );
    expect(router.routes[PUBLIC_ROUTE_PATTERNS.length].path).toBe("/");
  });
});

describe("permission-aware navigation", () => {
  it("uses the canonical Catalog 2.0 vocabulary for sidebar and direct route guards", () => {
    expect(CANONICAL_NAVIGATION_PERMISSIONS).toEqual({
      reports: "reports.read",
      users: "users.read",
      roles: "roles.read",
      permissions: "permissions.catalog.read",
      settings: "settings.read",
      auditTrail: "users.auditHistory.read",
      dataMigration: "masterData.read",
    });
    const requirements = new Map(APP_NAVIGATION_GROUPS.flatMap(group => group.items.map(item => [item.path, item.permission])));
    expect(requirements.get("/reports")).toBe(CANONICAL_NAVIGATION_PERMISSIONS.reports);
    expect(requirements.get("/users")).toBe(CANONICAL_NAVIGATION_PERMISSIONS.users);
    expect(requirements.get("/roles")).toBe(CANONICAL_NAVIGATION_PERMISSIONS.roles);
    expect(requirements.get("/permissions")).toBe(CANONICAL_NAVIGATION_PERMISSIONS.permissions);
    expect(requirements.get("/settings")).toBe(CANONICAL_NAVIGATION_PERMISSIONS.settings);
  });
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
      "Dashboard", "Equipment", "Bookings", "Rentals", "Maintenance",
      "Operators", "Projects", "Daily Logs", "Customers", "Billing", "Reports",
    ]);
  });

  it("shows finance and supporting read modules to Finance", () => {
    expect(labels("finance")).toContain("Billing");
    expect(labels("finance")).toContain("Rentals");
    expect(labels("finance")).not.toContain("Maintenance");
    expect(labels("finance")).not.toContain("Settings");
  });

  it("uses the authenticated effective permission set instead of static role permissions", () => {
    const finance = user("finance");
    const granted = new Set(["billing.read"]);
    const visible = getVisibleNavigation(
      finance,
      authorization,
      (permission) => granted.has(permission),
    ).flatMap((group) => group.items.map((item) => item.label));
    expect(visible).toEqual(["Billing"]);

    const administrator = user("system-administrator");
    expect(getVisibleNavigation(
      administrator,
      authorization,
      (permission) => permission === "dashboard.read",
    ).flatMap((group) => group.items.map((item) => item.label))).toEqual(["Dashboard"]);
  });

  it("applies the same effective permission check to Operator navigation", () => {
    const scoped = new AuthorizationService({ getById: (id) => ({ id, status: "Active" }) });
    const linked = { ...user("rental-operations"), operatorId: "operator-1" };
    expect(getVisibleNavigation(linked, scoped, () => false)).toEqual([]);
    expect(getVisibleNavigation(linked, scoped, (permission) => permission === "deur.read")
      .flatMap((group) => group.items.map((item) => item.label))).toEqual(["My Shift"]);
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
    const operatorScoped = new AuthorizationService({ getById: (id) => ({ id, status: "Active" }) });
    expect(getAuthorizedLandingPage(
      { ...user("rental-operations"), operatorId: "operator-1" },
      operatorScoped,
      { hasActiveOperatorLink: true },
    )).toBe("/operator");
    expect(getAuthorizedLandingPage(
      { ...user("rental-operations"), operatorId: "operator-1" },
      authorization,
      { hasActiveOperatorLink: false },
    )).toBe("/rentals");
    expect(getAuthorizedLandingPage({ ...user("finance"), status: "inactive" }, authorization)).toBeNull();
  });

  it("limits a canonical Operator persona to My Shift and denies administrative landing", () => {
    const scoped = new AuthorizationService({ getById: (id) => ({ id, status: "Active" }) });
    const linked = { ...user("rental-operations"), operatorId: "operator-1" };
    expect(getVisibleNavigation(linked, scoped).flatMap((group) => group.items.map((item) => item.label))).toEqual(["My Shift"]);
    expect(getAuthorizedLandingPage(linked, scoped)).toBe("/operator");
    expect(scoped.hasPermission(linked, "dashboard.read")).toBe(false);
    expect(scoped.hasPermission(linked, "rental.read")).toBe(false);
    expect(scoped.hasPermission(linked, "maintenance.read")).toBe(false);
  });
});
