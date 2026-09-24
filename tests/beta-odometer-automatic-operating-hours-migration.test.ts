import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/20260925000100_beta_odometer_only_deur_meter_policy.sql', 'utf8');

describe('beta odometer-only DEUR compatibility migration', () => {
  it('keeps hour evidence optional while requiring odometer for odometer-capable policies', () => {
    expect(sql).toContain("policy IN ('odometer','both')");
    expect(sql).toContain('opening_odo IS NULL');
    expect(sql).toContain('closing_odo IS NULL');
    expect(sql).not.toContain("policy='both' AND (opening_hour IS NULL");
  });

  it('preserves canonical monotonic odometer validation against checkpoint history', () => {
    expect(sql).toContain('FROM erp.deur_meter_checkpoints');
    expect(sql).toContain("meter_dimension='odometer'");
    expect(sql).toContain('closing_odo<latest_odo');
  });

  it('does not mutate historical snapshots or add maintenance scheduling', () => {
    expect(sql).not.toMatch(/UPDATE\s+erp\.rental_equipment_lines/i);
    expect(sql).not.toMatch(/UPDATE\s+erp\.deurs\s+SET\s+opening_hour_meter/i);
    expect(sql).toContain('activity events');
  });
});
