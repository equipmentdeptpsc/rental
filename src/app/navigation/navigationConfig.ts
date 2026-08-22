import type { Permission } from "@/features/auth/domain/permission";
import type { User } from "@/features/auth/domain/user";
import type { AuthorizationService } from "@/features/auth/services/AuthorizationService";

export interface NavigationItem {
  readonly label: string;
  readonly path: string;
  readonly icon:
    | "dashboard"
    | "equipment"
    | "assignments"
    | "rentals"
    | "maintenance"
    | "operators"
    | "projects"
    | "dailyLogs"
    | "customers"
    | "billing"
    | "reports"
    | "settings"
    | "users";
  readonly permission: Permission;
}

export interface NavigationGroup {
  readonly title: string;
  readonly items: readonly NavigationItem[];
}

export const APP_NAVIGATION_GROUPS: readonly NavigationGroup[] = Object.freeze([
  { title: "GENERAL", items: [{ icon: "dashboard", label: "Dashboard", path: "/dashboard", permission: "dashboard.read" }] },
  {
    title: "OPERATIONS",
    items: [
      { icon: "equipment", label: "Equipment", path: "/equipment", permission: "equipment.read" },
      { icon: "assignments", label: "Assignments", path: "/assignments", permission: "assignment.read" },
      { icon: "rentals", label: "Rentals", path: "/rentals", permission: "rental.read" },
      { icon: "maintenance", label: "Maintenance", path: "/maintenance", permission: "maintenance.read" },
      { icon: "operators", label: "Operators", path: "/operators", permission: "operator.read" },
      { icon: "projects", label: "Projects", path: "/projects", permission: "project.read" },
      { icon: "dailyLogs", label: "Daily Logs", path: "/daily-logs", permission: "dailyLog.read" },
      { icon: "customers", label: "Customers", path: "/customers", permission: "customer.read" },
    ],
  },
  { title: "FINANCE", items: [{ icon: "billing", label: "Billing", path: "/billing", permission: "billing.read" }] },
  { title: "ANALYTICS", items: [{ icon: "reports", label: "Reports", path: "/reports", permission: "reports.view" }] },
  { title: "SYSTEM", items: [
    { icon: "users", label: "Users", path: "/users", permission: "users.manage" },
    { icon: "users", label: "Roles", path: "/roles", permission: "users.manage" },
    { icon: "users", label: "Permissions", path: "/permissions", permission: "users.manage" },
    { icon: "settings", label: "Settings", path: "/settings", permission: "settings.manage" },
    { icon: "users", label: "Audit Trail", path: "/audit-trail", permission: "users.manage" },
    { icon: "settings", label: "Data Migration", path: "/data-migration", permission: "masterData.manage" },
  ] },
]);

export function getVisibleNavigation(
  user: User | null | undefined,
  authorization: AuthorizationService,
  hasPermission: (permission: Permission) => boolean = (permission) =>
    authorization.hasPermission(user, permission),
): readonly NavigationGroup[] {
  if (authorization.isOperatorPersona(user)) {
    return hasPermission("deur.read")
      ? [{ title: "OPERATIONS", items: [{ icon: "operators", label: "My Shift", path: "/operator", permission: "deur.read" }] }]
      : [];
  }
  const groups = APP_NAVIGATION_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      hasPermission(item.permission),
    ),
  })).filter((group) => group.items.length > 0);
  return groups;
}

const FALLBACK_LANDING_ORDER = ["/dashboard", "/rentals", "/billing", "/equipment", "/reports"];

export function getAuthorizedLandingPage(
  user: User | null | undefined,
  authorization: AuthorizationService,
  _options: { hasActiveOperatorLink?: boolean } = {},
): string | null {
  if (authorization.isOperatorPersona(user)) return authorization.hasPermission(user, "deur.read") ? "/operator" : null;
  if (
    user?.systemRoles.includes("system-administrator") &&
    authorization.hasPermission(user, "dashboard.read")
  ) return "/dashboard";
  if (user?.systemRoles.includes("rental-operations")) {
    if (authorization.hasPermission(user, "rental.read")) return "/rentals";
  }
  if (
    user?.systemRoles.includes("finance") &&
    authorization.hasPermission(user, "billing.read")
  ) return "/billing";
  if (
    user?.systemRoles.includes("management") &&
    authorization.hasPermission(user, "dashboard.read")
  ) return "/dashboard";

  const items = getVisibleNavigation(user, authorization).flatMap(
    (group) => group.items,
  );
  for (const path of FALLBACK_LANDING_ORDER) {
    if (items.some((item) => item.path === path)) return path;
  }
  return items[0]?.path ?? null;
}
