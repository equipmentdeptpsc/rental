import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { canonicalMeterEvidence } from "@/features/rental/deur/services/canonicalMeterEvidence";

describe("canonical dual-meter evidence", () => {
  it("gives explicit evidence precedence and keeps generic aliases single-meter only", () => {
    expect(canonicalMeterEvidence({ meterRequirement:"hourMeter", openingMeter:10, closingMeter:20, openingHourMeter:11, closingHourMeter:21 })).toMatchObject({ openingHourMeter:11, closingHourMeter:21, openingMeter:11, closingMeter:21 });
    expect(canonicalMeterEvidence({ meterRequirement:"odometer", openingMeter:10, closingMeter:20 })).toMatchObject({ openingOdometer:10, closingOdometer:20, openingMeter:10, closingMeter:20 });
  });

  it("never interprets a generic pair as BOTH evidence", () => {
    expect(canonicalMeterEvidence({ meterRequirement:"both", openingMeter:10, closingMeter:20 })).toEqual({
      meterRequirement:"both", openingHourMeter:undefined, closingHourMeter:undefined,
      openingOdometer:undefined, closingOdometer:undefined, openingMeter:undefined,
      closingMeter:undefined, legacyMeterEvidenceState:"LEGACY_AMBIGUOUS_DUAL_METER",
    });
  });

  it("defines additive fields, no backfill, server validation, and does not change billing", () => {
    const sql=readFileSync("supabase/migrations/20260916000100_add_canonical_dual_deur_meter_evidence.sql","utf8");
    for (const field of ["opening_hour_meter","closing_hour_meter","opening_odometer","closing_odometer"]) expect(sql).toContain(`${field} numeric(19,4)`);
    expect(sql).toContain("canonical_deur_meter_evidence");
    expect(sql).toContain("LEGACY_AMBIGUOUS_DUAL_METER");
    expect(sql).toContain("openingHourMeter");
    expect(sql).toContain("closingOdometer");
    expect(sql).not.toMatch(/\bUPDATE\s+erp\.deurs\s+SET\s+opening_hour_meter/i);
    expect(sql).not.toContain("METER_POLICY_UNSUPPORTED");
    expect(sql).not.toContain("calculate_deur_billing_evidence");
  });

  it("feeds every new persisted review snapshot through the one SQL projection", () => {
    const sql=readFileSync("supabase/migrations/20260916000100_add_canonical_dual_deur_meter_evidence.sql","utf8");
    for (const trigger of ["customer_review_requests", "manager_review_requests", "customer_review_batch_items"]) expect(sql).toContain(`BEFORE INSERT ON erp.${trigger}`);
    expect(sql).toContain("enforce_canonical_review_meter_snapshot");
    expect(sql).toContain("enforce_canonical_grouped_meter_snapshot");
    expect(sql).toContain("canonical_deur_meter_evidence");
  });
});
