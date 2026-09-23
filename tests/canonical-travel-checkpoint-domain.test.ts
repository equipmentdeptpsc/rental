import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260923000100_canonical_deur_travel_checkpoint_domain.sql", "utf8");

describe("canonical travel checkpoint domain migration", () => {
  it("extends the existing immutable evidence table without a backfill or parallel store", () => {
    for (const marker of ["ALTER TABLE erp.deur_meter_checkpoints", "ADD COLUMN IF NOT EXISTS sequence_no", "meter_dimension", "location_name", "custodian_operator_id", "NOT VALID", "uq_deur_meter_checkpoints_travel_sequence"]) expect(sql).toContain(marker);
    expect(sql).not.toMatch(/\b(?:DELETE|TRUNCATE|UPDATE\s+erp\.deur_meter_checkpoints)\b/i);
  });

  it("uses current custody, DEUR version, frozen policy, and idempotency boundaries", () => {
    for (const marker of ["erp.validate_deur_custody_command_scope", "erp.current_deur_authorized_operator", "erp.begin_deur_command", "erp.finish_deur_command", "current_deur.row_version", "policy NOT IN ('odometer','both')", "odometer<predecessor"]) expect(sql).toContain(marker);
  });

  it("keeps sequence and travel evidence server-owned while allowing optional paired GPS", () => {
    for (const marker of ["coalesce(max(sequence_no),0)+1", "meter_dimension='odometer'", "(latitude IS NULL)<>(longitude IS NULL)", "location_name", "clientOccurredAt", "kind='checkpoint'"]) expect(sql).toContain(marker);
  });

  it("exposes an ordered authorized read model with derived, non-persisted distance", () => {
    for (const marker of ["erp.read_deur_travel_checkpoint_history", "jsonb_agg(history.payload ORDER BY history.sequence_no)", "lag(checkpoint.reading)", "distanceFromPrevious", "OWNERSHIP_MISMATCH", "current_user_has_any_read_permission"]) expect(sql).toContain(marker);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE)\s+erp\.equipment_history\b/i);
  });
});
