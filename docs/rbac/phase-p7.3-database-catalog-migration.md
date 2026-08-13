# Phase P7.3 database RBAC catalog migration

## Migration design

Migration `20260803007700_phase_p7_canonical_rbac_catalog.sql` adds version `1.0.0` catalog metadata to `erp.app_roles` and `erp.app_permissions`, inserts the eight canonical roles and 172 permission records, and creates two catalog-only tables:

- `erp.permission_compatibility_aliases` stores migration-only legacy-to-canonical expansions.
- `erp.canonical_role_permission_catalog` stores the proposed deny-by-default matrix independently of effective runtime authority.

The migration intentionally does not write `erp.user_roles` or `erp.role_permissions`. `erp.effective_user_permissions` therefore remains unchanged. Existing role and permission IDs and display names are preserved on code conflicts; only catalog metadata is populated.

## Expected catalog counts

| Record type | Count |
|---|---:|
| Canonical roles | 8 |
| Standard permissions | 105 |
| Workflow permissions | 52 |
| Active permissions | 157 |
| Deprecated legacy permissions | 15 |
| Total permissions | 172 |
| Compatibility alias target rows | 63 |
| Canonical role-permission catalog rows | 421 |

## Test plan

1. Apply the complete migration chain to an empty local database.
2. Re-run the P7.3 body in a transaction to prove idempotence.
3. Assert the expected versioned catalog counts above.
4. Assert unique role codes, permission codes, and non-null resource/action pairs.
5. Assert every compatibility target is active, non-deprecated, and present.
6. Assert all 421 matrix rows resolve to version `1.0.0` roles and active permissions.
7. Snapshot and compare `user_roles` and `role_permissions` before and after execution.
8. Confirm `effective_user_permissions` has the same definition and result set before and after execution.
9. Confirm no RLS policy, RPC definition, frontend file, user assignment, or effective permission mapping changed.

The migration contains transactional assertions for steps 3 through 7 and rolls back on any mismatch.

## Backward compatibility assessment

- Existing roles and permissions are preserved by code-based upserts.
- Existing primary keys and names are not rewritten on conflicts.
- Existing user-role and effective role-permission mappings are neither inserted, updated, nor deleted.
- Compatibility aliases are metadata only and are not consulted by runtime authorization.
- The canonical matrix is inert until a separately reviewed cutover changes authority evaluation.
- Added metadata columns are nullable or have backward-compatible defaults.
- No RLS, grant, RPC, view, or application behavior is changed by this phase.

The principal residual risk is an unexpected pre-existing permission with the same non-null resource/action pair or an incompatible code identity. The migration fails transactionally rather than overwriting that conflict.
