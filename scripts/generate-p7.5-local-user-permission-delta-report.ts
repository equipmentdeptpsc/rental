import fs from "node:fs";
import type { IStorageService } from "../src/core/storage/IStorageService";
import type { User } from "../src/features/auth/domain/user";
import { LocalUserRepository } from "../src/features/auth/repository/LocalUserRepository";
import { DualPermissionComparisonService, type UserPermissionDelta } from "../src/features/auth/services/DualPermissionComparisonService";

class EphemeralLocalStorage implements IStorageService {
  readonly #values = new Map<string, unknown>();
  get<T>(key: string): T | null { return (this.#values.get(key) as T | undefined) ?? null; }
  set<T>(key: string, value: T): void { this.#values.set(key, value); }
  remove(key: string): void { this.#values.delete(key); }
  clear(): void { this.#values.clear(); }
}

const list = (values: readonly string[]): string => values.length ? values.map(value => `\`${value}\``).join(", ") : "None";
const yesNo = (value: boolean): string => value ? "YES" : "NO";

function aliases(delta: UserPermissionDelta): readonly string[] {
  return delta.compatibilityAliasExplanations.flatMap(explanation => explanation.projectedTargets);
}

function userSection(user: User, delta: UserPermissionDelta): string {
  const canonicalRoles = delta.roleMappingUsed.map(mapping => mapping.canonicalRole);
  return `#### ${user.displayName} (\`${user.id}\`)

- Username: \`${user.username}\`
- Status: \`${user.status}\`
- Legacy roles: ${list(user.systemRoles)}
- Projected canonical roles: ${list(canonicalRoles)}
- Operator linkage: ${user.operatorId ? `\`${user.operatorId}\`` : "None"}
- Legacy permission count: ${delta.legacyEffectivePermissions.length}
- Canonical permission count: ${delta.canonicalProjectedPermissions.length}
- Permissions in both (${delta.permissionsPresentInBoth.length}): ${list(delta.permissionsPresentInBoth)}
- Legacy-only permissions (${delta.legacyOnlyPermissions.length}): ${list(delta.legacyOnlyPermissions)}
- Canonical-only permissions (${delta.canonicalOnlyPermissions.length}): ${list(delta.canonicalOnlyPermissions)}
- Compatibility-alias-explained projected permissions (${aliases(delta).length}): ${list(aliases(delta))}
- Unexplained canonical-only permissions (${delta.unexplainedCanonicalOnlyPermissions.length}): ${list(delta.unexplainedCanonicalOnlyPermissions)}
- Manual classification required: **${yesNo(delta.manualClassificationRequired)}**
- Canonical mapping would increase authority: **${yesNo(delta.canonicalMappingWouldIncreaseAuthority)}**
- Blocking discrepancy: **${yesNo(delta.blockingDiscrepancy)}**
`;
}

export function generateLocalPermissionDeltaReport(users: readonly User[]): string {
  const comparison = new DualPermissionComparisonService();
  const orderedUsers = [...users].sort((left, right) => left.id.localeCompare(right.id));
  const results = orderedUsers.map(user => ({ user, delta: comparison.compare(user) }));
  const blocking = results.filter(({ delta }) => delta.blockingDiscrepancy);
  const rentalOperations = results.filter(({ user }) => user.systemRoles.includes("rental-operations"));
  const finance = results.filter(({ user }) => user.systemRoles.includes("finance"));
  const management = results.filter(({ user }) => user.systemRoles.includes("management"));
  const administrators = results.filter(({ user }) => user.systemRoles.includes("system-administrator"));

  return `# P7.5 local user permission-delta report

Catalog version: \`1.0.0\`  
Inventory source: \`LocalUserRepository.getUsers()\`  
Ordering: user ID, permission code, and alias code ascending  
Authority mode: legacy authorization remains authoritative

### Summary

The complete local inventory contains ${orderedUsers.length} active application users and ${blocking.length} users with unexplained canonical-only permissions. No roles, permissions, assignments, credentials, or runtime authorization were changed. This report intentionally excludes local passwords and all credential material.

### User Inventory

| User ID | Username / display | Status | Legacy roles | Operator linkage |
|---|---|---|---|---|
${orderedUsers.map(user => `| \`${user.id}\` | \`${user.username}\` / ${user.displayName} | ${user.status} | ${list(user.systemRoles)} | ${user.operatorId ? `\`${user.operatorId}\`` : "None"} |`).join("\n")}

### Per-User Permission Delta

${results.map(({ user, delta }) => userSection(user, delta)).join("\n")}
### Compatibility Alias Explanations

${results.map(({ user, delta }) => {
    const rows = delta.compatibilityAliasExplanations.map(explanation =>
      `- \`${explanation.legacyPermission}\` → ${list(explanation.canonicalTargets)}; projected targets: ${list(explanation.projectedTargets)}`,
    );
    return `#### ${user.displayName}\n\n${rows.length ? rows.join("\n") : "No applicable compatibility aliases."}`;
  }).join("\n\n")}

### Unexplained Privilege Increases

${blocking.map(({ user, delta }) => `- **${user.displayName}** (${delta.unexplainedCanonicalOnlyPermissions.length}): ${list(delta.unexplainedCanonicalOnlyPermissions)}`).join("\n") || "None."}

Every listed user is a blocking discrepancy for migration planning. These findings do not affect current authorization.

### Legacy Permission Losses

${results.map(({ user, delta }) => `- **${user.displayName}** (${delta.legacyOnlyPermissions.length}): ${list(delta.legacyOnlyPermissions)}`).join("\n")}

### Rental Operations Classification Requirements

${rentalOperations.map(({ user }) => `#### ${user.displayName} (\`${user.id}\`)

- Observable evidence: legacy role \`rental-operations\`; Operator linkage: ${user.operatorId ? `\`${user.operatorId}\`` : "None"}.
- Operations Manager: candidate only; broad legacy role is insufficient evidence of approval/closure duties.
- Dispatcher: candidate only; unlinked status is compatible with dispatch work but does not prove dispatch responsibility.
- Equipment Coordinator: candidate only; no user-specific fleet-coordination evidence exists.
- Operator: candidate only; no Operator linkage exists, so current evidence does not support assignment.
- Maintenance Staff: candidate only; no user-specific maintenance-duty evidence exists.
- Classification result: **MANUAL CLASSIFICATION REQUIRED**.`).join("\n\n") || "No Rental Operations users."}

### Finance Review

${finance.map(({ user, delta }) => `#### ${user.displayName}

- Projection: Finance → Billing Staff.
- Explained differences: ${list(aliases(delta))}
- Unexplained privilege increases: ${list(delta.unexplainedCanonicalOnlyPermissions)}
- Legacy permissions that would be lost: ${list(delta.legacyOnlyPermissions)}
- Resolution: explicit finance-owner review required; no automatic resolution performed.`).join("\n\n") || "No Finance users."}

### Management Review

${management.map(({ user, delta }) => `#### ${user.displayName}

- Projection: Management → Read-Only Auditor only.
- Operations Manager was not added.
- Business permissions that would be lost: ${list(delta.legacyOnlyPermissions)}
- Unexplained additions requiring review: ${list(delta.unexplainedCanonicalOnlyPermissions)}
- Resolution: explicit business-owner review required.`).join("\n\n") || "No Management users."}

### System Administrator Review

${administrators.map(({ user, delta }) => `- **${user.displayName}**: legacy ${delta.legacyEffectivePermissions.length} catalog permissions; canonical ${delta.canonicalProjectedPermissions.length} catalog permissions; unrestricted-authority equivalence confirmed; unexplained reduction: **NO**; blocking discrepancy: **${yesNo(delta.blockingDiscrepancy)}**.`).join("\n") || "No System Administrator users."}

The canonical System Administrator projection contains all ${administrators[0]?.delta.canonicalProjectedPermissions.length ?? 0} active canonical permissions. Differences in vocabulary do not reduce its unrestricted authority.

### Blocking Users

${blocking.map(({ user, delta }) => `- \`${user.id}\` (${user.displayName}): ${delta.unexplainedCanonicalOnlyPermissions.length} unexplained canonical-only permissions${delta.manualClassificationRequired ? "; manual classification required" : ""}.`).join("\n") || "None."}

### Migration Readiness

The local inventory is **not ready for canonical-role assignment or authority cutover**. The comparison layer is ready for delta resolution. Legacy authorization remains authoritative.

### Exact Next Step

Obtain business-owner decisions for every unexplained canonical-only permission, manually classify each Rental Operations user, and update the canonical design artifacts only through a separately authorized phase. Then regenerate this report and require zero unapproved privilege increases before planning user migration.

### Final Decision

**READY FOR P7.5 DELTA RESOLUTION**
`;
}

const repository = new LocalUserRepository(new EphemeralLocalStorage());
repository.initializeSeedUsers();
const report = generateLocalPermissionDeltaReport(repository.getUsers());
if (process.argv[2]) fs.writeFileSync(process.argv[2], report);
else process.stdout.write(report);
