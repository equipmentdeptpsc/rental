BEGIN;
SET search_path TO erp, public;

-- Stable reference IDs are intentionally human-readable. Application-owned IDs
-- are imported unchanged; this script does not seed transactional records.
INSERT INTO equipment_statuses (id, code, name, sort_order) VALUES
  ('equipment-status-available', 'AVAILABLE', 'Available', 10),
  ('equipment-status-assigned', 'ASSIGNED', 'Assigned', 20),
  ('equipment-status-rented', 'RENTED', 'Rented', 30),
  ('equipment-status-maintenance', 'MAINTENANCE', 'Maintenance', 40)
ON CONFLICT (id) DO UPDATE SET code=excluded.code, name=excluded.name, sort_order=excluded.sort_order;

INSERT INTO rental_statuses (id, code, name, sort_order) VALUES
  ('rental-status-draft', 'DRAFT', 'Draft', 10),
  ('rental-status-assigned', 'ASSIGNED', 'Assigned', 20),
  ('rental-status-reserved', 'RESERVED', 'Reserved', 30),
  ('rental-status-released', 'RELEASED', 'Released', 40),
  ('rental-status-active', 'ACTIVE', 'Active', 50),
  ('rental-status-returned', 'RETURNED', 'Returned', 60),
  ('rental-status-closed', 'CLOSED', 'Closed', 70),
  ('rental-status-cancelled', 'CANCELLED', 'Cancelled', 80)
ON CONFLICT (id) DO UPDATE SET code=excluded.code, name=excluded.name, sort_order=excluded.sort_order;

-- Other masters (customers, projects, operators, categories, types, models,
-- brands, conditions, locations, ownerships, cost/activity/work codes) must be
-- imported from the Local Storage backup so their existing IDs are preserved.

COMMIT;
