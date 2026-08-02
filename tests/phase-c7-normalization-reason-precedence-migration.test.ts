import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.resolve(
  "supabase/migrations/20260802004300_phase_c7_normalization_reason_precedence.sql",
);
const priorMigrationPath = path.resolve(
  "supabase/migrations/20260802004200_phase_c7_guarded_legacy_rental_normalization.sql",
);
const sql = fs.readFileSync(migrationPath, "utf8");

const precedence = new Map(
  [...sql.matchAll(/WHEN '([^']+)' THEN (\d+)/g)].map((match) => [match[1], Number(match[2])]),
);

function orderReasons(reasons: readonly string[]): string[] {
  return [...new Set(reasons)].sort(
    (left, right) =>
      (precedence.get(left) ?? 1000) - (precedence.get(right) ?? 1000) ||
      left.localeCompare(right),
  );
}

describe("legacy normalization reason precedence migration", () => {
  it.each([
    [["SUBMITTED_DEUR_EXISTS"], "SUBMITTED_DEUR_EXISTS"],
    [["DRAFT_DEUR_INCOMPATIBLE"], "DRAFT_DEUR_INCOMPATIBLE"],
    [["SUBMITTED_DEUR_EXISTS", "CUSTOMER_REVIEW_EXISTS"], "CUSTOMER_REVIEW_EXISTS"],
    [["SUBMITTED_DEUR_EXISTS", "MANAGER_OUTCOME_EXISTS"], "MANAGER_OUTCOME_EXISTS"],
    [["CUSTOMER_REVIEW_EXISTS", "MANAGER_OUTCOME_EXISTS"], "MANAGER_OUTCOME_EXISTS"],
    [["MANAGER_OUTCOME_EXISTS", "BILLING_EVIDENCE_EXISTS"], "BILLING_EVIDENCE_EXISTS"],
    [["BILLING_EVIDENCE_EXISTS", "INVOICE_OR_COLLECTION_EXISTS"], "INVOICE_OR_COLLECTION_EXISTS"],
    [["BILLING_EVIDENCE_EXISTS", "RECOVERY_EVIDENCE_EXISTS"], "RECOVERY_EVIDENCE_EXISTS"],
    [["CUSTOMER_REVIEW_EXISTS", "RETURNED_OR_CLOSED_RENTAL"], "RETURNED_OR_CLOSED_RENTAL"],
    [["ALREADY_NORMALIZED"], "ALREADY_NORMALIZED"],
    [["SOURCE_DATA_INCOMPLETE", "WORK_DESCRIPTION_MISSING", "ASSIGNMENT_INVALID"], "SOURCE_DATA_INCOMPLETE"],
  ])("selects a stable controlling reason for %j", (input, expected) => {
    expect(orderReasons(input)[0]).toBe(expected);
    expect(orderReasons([...input].reverse())).toEqual(orderReasons(input));
  });

  it("retains all applicable reasons, removes duplicates, and orders unknown line reasons", () => {
    expect(
      orderReasons([
        "SUBMITTED_DEUR_EXISTS",
        "CUSTOMER_REVIEW_EXISTS",
        "SUBMITTED_DEUR_EXISTS",
        "WORK_DESCRIPTION_MISSING",
        "ASSIGNMENT_INVALID",
      ]),
    ).toEqual([
      "CUSTOMER_REVIEW_EXISTS",
      "SUBMITTED_DEUR_EXISTS",
      "ASSIGNMENT_INVALID",
      "WORK_DESCRIPTION_MISSING",
    ]);
  });

  it("preserves the structured result and makes the command consume the controlling code", () => {
    expect(sql).toContain("'{controllingReasonCode}'");
    expect(sql).toContain("result->'reasonCodes'");
    expect(sql).toContain("eligibility->>'controllingReasonCode'");
    expect(sql).toContain("'eligibility',eligibility");
    expect(sql).toContain("jsonb_set(result,'{reasonCodes}',ordered_reasons,true)");
  });

  it("preserves security, tenant, idempotency, and evidence protections", () => {
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("SET search_path=erp,auth");
    expect(sql).toContain("OWNER TO postgres");
    expect(sql).toContain("tenant<>'TENANT-UAT-C7-NORMALIZE-001'");
    expect(sql).toContain("begin_operational_command");
    expect(sql).toContain("finish_operational_command");
    expect(sql).toContain("ORDER BY id FOR UPDATE");
    expect(sql).toContain("current_deur_expectation_fingerprint(id)");
  });

  it("does not rewrite applied migration 04200", () => {
    const digest = createHash("sha256").update(fs.readFileSync(priorMigrationPath)).digest("hex");
    expect(digest).toBe("33d0ddbd72ab00e9cc0122da2aaa92207c75a5d6a5223ea4892286aaa7e2b746");
  });
});
