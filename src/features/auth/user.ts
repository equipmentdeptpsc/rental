import type { Role } from "./role";

/**
 * Core user identity model for the system
 * Used for authentication + role-based access control
 */
export type User = {
  id: string;        // unique user identifier
  name: string;      // display name
  role: Role;       // Admin or Operator (from role.ts)
};

export function localUatUserId(name: string, role: Role): string {
  const normalized = name.trim().toLocaleLowerCase().replace(/\s+/g, "-");
  return `uat-user:${role.toLocaleLowerCase()}:${encodeURIComponent(normalized)}`;
}
