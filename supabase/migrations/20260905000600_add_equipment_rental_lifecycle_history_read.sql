BEGIN;

SET LOCAL search_path = erp, auth, public;

CREATE OR REPLACE FUNCTION erp.get_equipment_rental_lifecycle_events(
  target_equipment_id text,
  requested_limit integer DEFAULT 10
)
RETURNS TABLE (
  id text,
  rental_id text,
  rental_number text,
  event_type text,
  occurred_at timestamptz,
  customer_id text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  WITH visible_equipment AS (
    SELECT equipment.id, equipment.company_id
    FROM erp.equipment AS equipment
    WHERE equipment.id = target_equipment_id
      AND equipment.deleted_at IS NULL
      AND erp.can_read_company_row(equipment.company_id)
      AND erp.current_user_has_permission('rental.read')
  ),
  linked_rentals AS (
    SELECT DISTINCT rental.id, rental.rental_number, rental.customer_id,
      rental.reserved_at, rental.released_at, rental.activated_at,
      rental.returned_at, rental.closed_at, rental.cancelled_at
    FROM erp.rental_equipment_lines AS line
    JOIN visible_equipment
      ON visible_equipment.id = line.equipment_id
      AND visible_equipment.company_id = line.company_id
    JOIN erp.rentals AS rental
      ON rental.id = line.rental_id
      AND rental.company_id = visible_equipment.company_id
    WHERE line.deleted_at IS NULL
  ),
  lifecycle_events AS (
    SELECT rental.id || ':Reserved:' || rental.reserved_at::text AS id, rental.id AS rental_id, rental.rental_number, 'Reserved'::text AS event_type, rental.reserved_at AS occurred_at, rental.customer_id
    FROM linked_rentals AS rental WHERE rental.reserved_at IS NOT NULL
    UNION ALL
    SELECT rental.id || ':Released:' || rental.released_at::text, rental.id, rental.rental_number, 'Released'::text, rental.released_at, rental.customer_id
    FROM linked_rentals AS rental WHERE rental.released_at IS NOT NULL
    UNION ALL
    SELECT rental.id || ':Activated:' || rental.activated_at::text, rental.id, rental.rental_number, 'Activated'::text, rental.activated_at, rental.customer_id
    FROM linked_rentals AS rental WHERE rental.activated_at IS NOT NULL
    UNION ALL
    SELECT rental.id || ':Returned:' || rental.returned_at::text, rental.id, rental.rental_number, 'Returned'::text, rental.returned_at, rental.customer_id
    FROM linked_rentals AS rental WHERE rental.returned_at IS NOT NULL
    UNION ALL
    SELECT rental.id || ':Closed:' || rental.closed_at::text, rental.id, rental.rental_number, 'Closed'::text, rental.closed_at, rental.customer_id
    FROM linked_rentals AS rental WHERE rental.closed_at IS NOT NULL
    UNION ALL
    SELECT rental.id || ':Cancelled:' || rental.cancelled_at::text, rental.id, rental.rental_number, 'Cancelled'::text, rental.cancelled_at, rental.customer_id
    FROM linked_rentals AS rental WHERE rental.cancelled_at IS NOT NULL
  )
  SELECT event.id, event.rental_id, event.rental_number, event.event_type, event.occurred_at, event.customer_id
  FROM lifecycle_events AS event
  ORDER BY event.occurred_at DESC, event.id DESC
  LIMIT LEAST(20, GREATEST(1, COALESCE(requested_limit, 10)));
$$;

ALTER FUNCTION erp.get_equipment_rental_lifecycle_events(text, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION erp.get_equipment_rental_lifecycle_events(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION erp.get_equipment_rental_lifecycle_events(text, integer) TO authenticated;

COMMENT ON FUNCTION erp.get_equipment_rental_lifecycle_events(text, integer) IS
  'Read-only, tenant-derived Equipment Rental lifecycle history. It emits only non-null authoritative Rental lifecycle timestamps through non-deleted Rental Equipment Lines, requires rental.read, and does not accept a client company scope.';

COMMIT;
