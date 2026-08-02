select json_agg(json_build_object(
  'constraint', c.conname,
  'child', c.conrelid::regclass::text,
  'parent', c.confrelid::regclass::text,
  'definition', pg_get_constraintdef(c.oid)
) order by c.conrelid::regclass::text, c.conname) as foreign_keys
from pg_constraint c
where c.contype = 'f'
  and (c.connamespace = 'erp'::regnamespace)
  and (
    c.conrelid in (
      'erp.companies'::regclass,'erp.users'::regclass,'erp.operators'::regclass,
      'erp.customers'::regclass,'erp.projects'::regclass,'erp.equipment'::regclass,
      'erp.assignments'::regclass,'erp.rentals'::regclass,'erp.rental_equipment_lines'::regclass,
      'erp.deurs'::regclass,'erp.deur_events'::regclass,'erp.audit_log'::regclass,
      'erp.operational_command_idempotency'::regclass
    )
    or c.confrelid in (
      'erp.companies'::regclass,'erp.users'::regclass,'erp.operators'::regclass,
      'erp.customers'::regclass,'erp.projects'::regclass,'erp.equipment'::regclass,
      'erp.assignments'::regclass,'erp.rentals'::regclass,'erp.rental_equipment_lines'::regclass,
      'erp.deurs'::regclass,'erp.deur_events'::regclass,'erp.audit_log'::regclass,
      'erp.operational_command_idempotency'::regclass
    )
  );
