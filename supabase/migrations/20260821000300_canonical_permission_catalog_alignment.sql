BEGIN;

-- Align the pre-P7 remote permission catalogue with the application's
-- current canonical permission model.
--
-- Additive only:
--   * no existing permission is removed or renamed
--   * no user-role assignment is changed
--   * no application role is created
--   * role mappings are added only when the canonical role already exists

INSERT INTO erp.app_permissions (id, code, name)
VALUES
    ('PERM-CANON-COLLECTIONS-MANAGE',       'collections.manage',       'Manage Collections'),
    ('PERM-CANON-MASTERDATA-MANAGE',        'masterData.manage',        'Manage Master Data'),
    ('PERM-CANON-RENTAL-APPROVAL-DECIDE',   'rental.approval.decide',   'Decide Rental Approval'),
    ('PERM-CANON-RENTAL-APPROVAL-SUBMIT',   'rental.approval.submit',   'Submit Rental for Approval'),
    ('PERM-CANON-ROLES-MANAGE',              'roles.manage',             'Manage Roles'),
    ('PERM-CANON-SETTINGS-MANAGE',           'settings.manage',          'Manage Settings')
ON CONFLICT (code) DO NOTHING;

-- System Administrator owns the complete canonical permission catalogue.
INSERT INTO erp.role_permissions (role_id, permission_id)
SELECT
    r.id,
    p.id
FROM erp.app_roles r
CROSS JOIN erp.app_permissions p
WHERE r.code = 'system-administrator'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Rental Operations may submit Rentals for approval.
INSERT INTO erp.role_permissions (role_id, permission_id)
SELECT
    r.id,
    p.id
FROM erp.app_roles r
JOIN erp.app_permissions p
  ON p.code = 'rental.approval.submit'
WHERE r.code = 'rental-operations'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Finance manages Collections.
INSERT INTO erp.role_permissions (role_id, permission_id)
SELECT
    r.id,
    p.id
FROM erp.app_roles r
JOIN erp.app_permissions p
  ON p.code = 'collections.manage'
WHERE r.code = 'finance'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- If a Management role already exists, align its approval decision authority.
-- This does NOT create the Management role.
INSERT INTO erp.role_permissions (role_id, permission_id)
SELECT
    r.id,
    p.id
FROM erp.app_roles r
JOIN erp.app_permissions p
  ON p.code = 'rental.approval.decide'
WHERE r.code = 'management'
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;
