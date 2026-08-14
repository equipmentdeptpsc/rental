# Canonical RBAC catalog specification

Status: design artifact only. Version: `2.0.0`.

These files define the proposed single source of truth for the production RBAC catalog. They are not imported by application code, do not change runtime behavior, and have not been applied to any database.

## Artifacts

- `canonical-roles.json`: nine canonical roles and invariant constraints.
- `canonical-permission-groups.json`: administration display groups and configuration sections.
- `canonical-permissions.json`: 105 derived standard permissions, workflow permissions, deprecated legacy permissions, and migration-only aliases.
- `role-permission-matrix.json`: deny-by-default canonical grants and scope rules.
- Matching JSON Schema Draft 2020-12 files validate document shape.

## Deterministic standard expansion

The standard permission catalog is the Cartesian product of each declared resource and action:

```text
code = resource + "." + action
```

Example records generated from the catalog:

```json
{
  "code": "equipment.update",
  "resource": "equipment",
  "action": "update",
  "riskClass": "WRITE"
}
```

```json
{
  "code": "billing.close",
  "resource": "billing",
  "action": "close",
  "riskClass": "TERMINAL"
}
```

Workflow permissions are explicit records because their actions are domain-specific.

## Migration mapping

| Current role | Canonical destination | Migration rule |
|---|---|---|
| `system-administrator` | `system-administrator` | Deterministic one-to-one mapping; migrate last after final-admin tests. |
| `rental-operations` | Manual classification | Do not automatically preserve its broad union. Classify each user as Operations Manager, Dispatcher, Equipment Coordinator, Operator, Maintenance Staff, or an approved combination. |
| `finance` | `billing-staff` | Default one-to-one mapping after permission-delta review. |
| `management` | `read-only-auditor` by default | Add Operations Manager only when approved business duties require mutation/approval authority. |

Legacy permission aliases are `migration-only`. They support permission-delta analysis and staged command migration; they must never become a permanent runtime expansion mechanism.

## Validation rules

Shape validation uses the included JSON schemas. Semantic validation must additionally prove:

1. All three catalog versions are compatible.
2. Role codes are unique and equal the approved eight-code manifest.
3. Expanded standard permission codes are unique.
4. Workflow and legacy codes are unique within and across sections; standard codes are unique after expansion.
5. Every code decomposes to its declared resource and action.
6. Every risk class belongs to the manifest.
7. Every matrix role exists in the role catalog, and every role has one grant entry.
8. Every matrix workflow grant resolves to an active workflow permission.
9. Every matrix standard action resolves to an expanded standard permission.
10. Every legacy replacement and alias target resolves to an active canonical permission. A migration-only alias source may equal a retained standard code (currently `rental.approve`) only when the matrix grants the replacement workflow permissions instead of the retained standard code.
11. No alias targets another deprecated permission or alias.
12. Alias expansion is acyclic.
13. Read-Only Auditor has only `read`, `export`, `dashboard.read`, `dashboard.export`, and `roles.read`.
14. Operator has the required scope rules and no approve/delete permission.
15. Only System Administrator uses `allPermissions=true`.
16. Unlisted role/resource/action combinations are denied.

## Versioning and deprecation

- Patch: descriptions or metadata only; no effective grant changes.
- Minor: additive roles are prohibited, but additive permissions or deny-by-default workflow entries are allowed.
- Major: role changes, permission removal, alias behavior, or effective grant changes.
- Deprecated permissions remain addressable for migration reporting but must carry replacements.
- Retirement requires zero database mappings, zero command checks, zero frontend references, and zero active compatibility use.

## Test strategy

### Catalog contract tests

- Validate every artifact against its schema.
- Expand the Cartesian catalog and snapshot its sorted code manifest.
- Assert exact counts: 9 roles, 105 standard permissions, and 168 active permissions.
- Assert uniqueness, decomposition, risk classification, reference integrity, and alias acyclicity.

### Matrix tests

- Expand every role to an effective permission set.
- Snapshot each sorted role grant set.
- Assert deny-by-default for unknown roles and permissions.
- Assert role invariants for administrator, operator, billing, maintenance, and auditor.
- Produce legacy-versus-canonical permission deltas for every current role.

### Application tests for a later phase

- Route and navigation tests for all eight roles.
- Direct context/service mutation-denial tests.
- Database RPC and cross-tenant denial tests.
- Operator record-scope tests.
- Separate tests for read/create/update/delete/approve/close/export.
- Session refresh tests after role changes.
- Self-escalation, final-administrator, export-redaction, and backup-restore tests.

## Migration safety

This specification performs no migration. A future migration must add catalog data without assigning new roles or changing effective permissions, run dual legacy/canonical permission-delta checks, and stop on any unapproved privilege increase.
