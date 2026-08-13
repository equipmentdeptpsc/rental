import canonicalPermissionsDocument from "../../../../docs/rbac/canonical-permissions.json";
import canonicalMatrixDocument from "../../../../docs/rbac/role-permission-matrix.json";
import type { Permission } from "../domain/permission";
import type { SystemRole } from "../domain/systemRole";
import type { User } from "../domain/user";
import { AuthorizationService } from "./AuthorizationService";

type CanonicalRoleCode = keyof typeof canonicalMatrixDocument.grants;

export interface PermissionCompatibilityExplanation {
  readonly legacyPermission: string;
  readonly canonicalTargets: readonly string[];
  readonly projectedTargets: readonly string[];
}

export interface RoleProjection {
  readonly legacyRole: SystemRole;
  readonly canonicalRole: CanonicalRoleCode;
  readonly comparisonOnly: true;
  readonly manualClassificationRequired: boolean;
  readonly rationale: string;
}

export interface UserPermissionDelta {
  readonly userId: string;
  readonly catalogVersion: string;
  readonly legacyEffectivePermissions: readonly string[];
  readonly canonicalProjectedPermissions: readonly string[];
  readonly permissionsPresentInBoth: readonly string[];
  readonly legacyOnlyPermissions: readonly string[];
  readonly canonicalOnlyPermissions: readonly string[];
  readonly unexplainedCanonicalOnlyPermissions: readonly string[];
  readonly compatibilityAliasExplanations: readonly PermissionCompatibilityExplanation[];
  readonly roleMappingUsed: readonly RoleProjection[];
  readonly manualClassificationRequired: boolean;
  readonly canonicalMappingWouldIncreaseAuthority: boolean;
  readonly blockingDiscrepancy: boolean;
}

const ROLE_PROJECTIONS: Readonly<Record<SystemRole, RoleProjection>> = Object.freeze({
  "system-administrator": Object.freeze({
    legacyRole: "system-administrator", canonicalRole: "system-administrator",
    comparisonOnly: true, manualClassificationRequired: false,
    rationale: "Equivalent unrestricted administrator comparison; legacy authority remains authoritative.",
  }),
  finance: Object.freeze({
    legacyRole: "finance", canonicalRole: "billing-staff",
    comparisonOnly: true, manualClassificationRequired: false,
    rationale: "Finance is projected to Billing Staff for permission-delta review.",
  }),
  "rental-operations": Object.freeze({
    legacyRole: "rental-operations", canonicalRole: "operations-manager",
    comparisonOnly: true, manualClassificationRequired: true,
    rationale: "Temporary comparison only; each user requires manual operational-role classification before migration.",
  }),
  management: Object.freeze({
    legacyRole: "management", canonicalRole: "read-only-auditor",
    comparisonOnly: true, manualClassificationRequired: false,
    rationale: "Management remains read-oriented and must not automatically gain Operations Manager authority.",
  }),
});

const sorted = (values: Iterable<string>): readonly string[] => Object.freeze([...new Set(values)].sort());

function canonicalPermissionCodes(): readonly string[] {
  const standard = canonicalPermissionsDocument.standardCatalog.resources.flatMap(resource =>
    canonicalPermissionsDocument.standardCatalog.actions.map(({ action }) => `${resource}.${action}`),
  );
  return sorted([...standard, ...canonicalPermissionsDocument.workflowPermissions.map(permission => permission.code)]);
}

const ALL_CANONICAL_PERMISSIONS = canonicalPermissionCodes();

function permissionsForCanonicalRole(role: CanonicalRoleCode): readonly string[] {
  const grant = canonicalMatrixDocument.grants[role];
  if ("allPermissions" in grant && grant.allPermissions) return ALL_CANONICAL_PERMISSIONS;
  const standard = Object.entries(grant.standard).flatMap(([resource, actions]) =>
    actions.map(action => `${resource}.${action}`),
  );
  return sorted([...standard, ...grant.workflow]);
}

export class DualPermissionComparisonService {
  constructor(private readonly legacyAuthorization: AuthorizationService = new AuthorizationService()) {}

  compare(user: User): UserPermissionDelta {
    const legacy = user.status === "active"
      ? sorted(this.legacyAuthorization.getEffectivePermissions(user) as ReadonlySet<Permission>)
      : Object.freeze([] as string[]);
    const roleMappingUsed = user.status === "active"
      ? [...new Set(user.systemRoles)].map(role => ROLE_PROJECTIONS[role]).filter((mapping): mapping is RoleProjection => Boolean(mapping))
      : [];
    const canonical = sorted(roleMappingUsed.flatMap(mapping => permissionsForCanonicalRole(mapping.canonicalRole)));
    const legacySet = new Set(legacy);
    const canonicalSet = new Set(canonical);
    const both = sorted(legacy.filter(permission => canonicalSet.has(permission)));
    const legacyOnly = sorted(legacy.filter(permission => !canonicalSet.has(permission)));
    const canonicalOnly = sorted(canonical.filter(permission => !legacySet.has(permission)));

    const explanations = canonicalPermissionsDocument.compatibilityAliases
      .filter(alias => legacySet.has(alias.legacyCode))
      .map(alias => Object.freeze({
        legacyPermission: alias.legacyCode,
        canonicalTargets: sorted(alias.expandsTo),
        projectedTargets: sorted(alias.expandsTo.filter(target => canonicalSet.has(target))),
      }))
      .sort((left, right) => left.legacyPermission.localeCompare(right.legacyPermission));
    const aliasCovered = new Set(explanations.flatMap(explanation => explanation.projectedTargets));
    const administratorEquivalent = roleMappingUsed.some(mapping => mapping.legacyRole === "system-administrator");
    const unexplainedCanonicalOnly = administratorEquivalent
      ? Object.freeze([] as string[])
      : sorted(canonicalOnly.filter(permission => !aliasCovered.has(permission)));
    const increase = unexplainedCanonicalOnly.length > 0;

    return Object.freeze({
      userId: user.id,
      catalogVersion: canonicalPermissionsDocument.version,
      legacyEffectivePermissions: legacy,
      canonicalProjectedPermissions: canonical,
      permissionsPresentInBoth: both,
      legacyOnlyPermissions: legacyOnly,
      canonicalOnlyPermissions: canonicalOnly,
      unexplainedCanonicalOnlyPermissions: unexplainedCanonicalOnly,
      compatibilityAliasExplanations: Object.freeze(explanations),
      roleMappingUsed: Object.freeze(roleMappingUsed),
      manualClassificationRequired: roleMappingUsed.some(mapping => mapping.manualClassificationRequired),
      canonicalMappingWouldIncreaseAuthority: increase,
      blockingDiscrepancy: increase,
    });
  }
}
