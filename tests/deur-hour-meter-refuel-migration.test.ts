import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20261014000200_deur_hour_meter_refuel_evidence.sql",
  "utf8",
);

describe("hour-meter refuel evidence", () => {
  it("stores exactly one meter dimension without inventing an odometer reading", () => {
    expect(migration).toContain("ALTER COLUMN odometer DROP NOT NULL");
    expect(migration).toContain("meter_dimension='hourMeter' AND hour_meter IS NOT NULL");
    expect(migration).toContain("odometer IS NULL");
    expect(migration).toContain("meter_dimension='odometer' AND odometer IS NOT NULL");
  });

  it("keeps canonical custody, idempotency, monotonicity, and post-shift guards", () => {
    for (const guard of [
      "validate_deur_custody_command_scope(command,'deur.create')",
      "erp.begin_deur_command(command,'RECORD_DEUR_REFUEL')",
      "erp.current_deur_authorized_operator(target.id)",
      "target.status<>'In Progress'",
      "activity_type='shift' AND action='end'",
      "predecessor IS NOT NULL",
      "erp.finish_deur_command(command,'RECORD_DEUR_REFUEL'",
    ]) expect(migration).toContain(guard);
  });

  it("retains tenant-scoped history and authenticated RPC grants", () => {
    expect(migration).toContain("r.company_id=tenant AND r.equipment_id=target_equipment_id");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION erp.command_record_deur_refuel(jsonb),erp.read_equipment_refuel_history(text)");
    expect(migration).toContain("FROM PUBLIC,anon,service_role");
  });
});
