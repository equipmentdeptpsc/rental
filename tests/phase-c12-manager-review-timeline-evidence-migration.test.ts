import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync("supabase/migrations/20260803005400_phase_c12_manager_review_timeline_evidence.sql", "utf8");
const contract = readFileSync("src/features/rental/manager-review/managerReviewContracts.ts", "utf8");
const page = readFileSync("src/pages/ManagerDeurReview/index.tsx", "utf8");

describe("C12 Manager immutable activity timeline evidence", () => {
  it("uses the exact canonical DEUR event source and excludes shift/open events", () => {
    expect(sql).toContain("FROM deur_events event_rows");
    expect(sql).toContain("event_rows.company_id = target_company_id");
    expect(sql).toContain("event_rows.deur_id = target_deur_id");
    expect(sql).toContain("event_rows.activity_type <> 'shift'");
    expect(sql).toContain("event_rows.is_open = false");
    expect(sql).not.toMatch(/deur_activity_logs event_rows/);
  });

  it("freezes operation, idle, standby, meal-break, and breakdown events without inventing intervals", () => {
    for (const field of ["'activity'", "'action'", "'occurredAt'", "'sequence'"]) expect(sql).toContain(field);
    expect(sql).toContain("event_rows.activity_type");
    expect(sql).toContain("event_rows.occurred_at");
    expect(sql).toContain("completed_end.activity_type = event_rows.activity_type");
    expect(sql).toContain("completed_start.activity_type = event_rows.activity_type");
    expect(sql).not.toMatch(/durationMinutes|durationSeconds|date_part|extract\(/i);
  });

  it("orders deterministically by canonical sequence with stable tie breakers", () => {
    expect(sql).toContain("ORDER BY event_rows.sequence, event_rows.occurred_at, event_rows.id");
  });

  it("cannot leak another tenant, line, DEUR, or revision", () => {
    expect(sql).toContain("rental_equipment_line_id = target_line_id");
    expect(sql).toContain("company_id = target_company_id");
    expect(sql).toContain("event_rows.company_id = target_company_id");
    expect(sql).toContain("event_rows.deur_id = target_deur_id");
    expect(sql).toContain("target.superseded_by_revision_id IS NOT NULL");
  });

  it("preserves identity, shift, totals, and customer acknowledgement evidence", () => {
    for (const field of ["companyName", "customerName", "assetNumber", "shiftStart", "shiftEnd", "operationMinutes", "idleMinutes", "standbyMinutes", "customerDecision"]) {
      expect(sql).toContain(`'${field}'`);
    }
    expect(sql).toContain("decision.action IS DISTINCT FROM 'ACKNOWLEDGE'");
    expect(sql).toContain("'timeline', timeline");
  });

  it("makes timeline a required immutable public contract and removes the misleading fallback", () => {
    expect(contract).toContain('timeline: import("../customer-review/publicReviewContracts").PublicReviewTimelineEntry[]');
    expect(contract).not.toContain("timeline?:");
    expect(page).toContain("buildPublicReviewIntervals(snapshot.timeline)");
    expect(page).not.toContain("snapshot.timeline??[]");
  });

  it("preserves the private builder grant and explicit search path", () => {
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path = erp, pg_catalog");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
    expect(sql).not.toMatch(/GRANT EXECUTE/);
  });

  it("does not alter public lookup, decision, recipient, or credential functions", () => {
    for (const name of ["get_manager_review", "decide_manager_review", "resolve_manager_review_recipient", "command_create_manager_review_request"]) {
      expect(sql).not.toContain(`CREATE OR REPLACE FUNCTION erp.${name}`);
    }
    expect(sql).not.toMatch(/token_hash|digest\(|raw_token|idempotency/i);
  });
});
