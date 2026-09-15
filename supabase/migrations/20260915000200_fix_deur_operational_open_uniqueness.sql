BEGIN;

-- Normal operator Start Shift must conflict only with a DEUR that remains
-- operationally open. The original late-entry index unintentionally covered
-- terminal and downstream records (including Submitted), so its unique
-- violation was surfaced as DUPLICATE_ACTIVE_DEUR after a successful submit.
DROP INDEX IF EXISTS erp.uq_deur_line_workday_origin;
CREATE UNIQUE INDEX uq_deur_line_workday_origin
  ON erp.deurs(company_id,rental_equipment_line_id,work_date)
  WHERE previous_revision_id IS NULL AND status IN ('Draft','In Progress');

COMMENT ON INDEX erp.uq_deur_line_workday_origin IS
  'One operationally open original DEUR per rental line and work date; terminal and downstream DEUR states remain historical.';

COMMIT;
