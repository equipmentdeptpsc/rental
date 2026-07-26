import { describe, expect, it } from "vitest";
import { normalizeRentalDeurExpectationPolicy } from "@/features/rental/deur/expectation/normalizeRentalDeurExpectationPolicy";
import { generateRentalDeurExpectations } from "@/features/rental/deur/expectation/generateRentalDeurExpectations";
import { matchDeursToExpectations } from "@/features/rental/deur/expectation/matchDeursToExpectations";
import type { RentalDeurExpectationPolicy, RentalRecord } from "@/features/rental/types";
import type { DeurRecord } from "@/features/rental/deur/types";
import { evaluateRentalDeurCompliance } from "@/features/rental/deur/compliance/evaluateRentalDeurCompliance";
import { calendarDateAt } from "@/features/rental/deur/expectation/dateRules";
import { buildRentalDeurComplianceReport } from "@/features/rental/deur/compliance/buildRentalDeurComplianceReport";

const policy = (overrides: Partial<RentalDeurExpectationPolicy> = {}): RentalDeurExpectationPolicy => ({
  frequency: "PER_WORKDAY", effectiveFrom: "2026-07-20", capturedAt: "2026-07-19T00:00:00.000Z", timezone: "Asia/Manila", ...overrides,
});
const rental = (overrides: Partial<RentalRecord> = {}): RentalRecord => ({
  id: "rental", equipmentId: "equipment", operatorId: "operator", customer: "Customer", project: "Project", rentedBy: "Admin",
  dateOut: "2026-07-20", statusId: "active", status: "Active", releasedAt: "2026-07-20T00:00:00.000Z",
  deurExpectationPolicy: policy(), deurExpectationPolicyFrozenAt: "2026-07-20T00:00:00.000Z", deurExpectationPolicyRequired: true, ...overrides,
  deurShiftWindowSnapshots: [
    { code: "DAY", label: "Day Shift", startTime: "08:00", endTime: "17:00", timezone: "Asia/Manila", capturedAt: "2026-07-20T00:00:00.000Z" },
    { code: "NIGHT", label: "Night Shift", startTime: "20:00", endTime: "05:00", timezone: "Asia/Manila", capturedAt: "2026-07-20T00:00:00.000Z" },
  ],
});
const deur = (overrides: Partial<DeurRecord> = {}): DeurRecord => ({
  id: "deur", rentalId: "rental", equipmentId: "equipment", operatorId: "operator", workDate: "2026-07-20", status: "Acknowledged",
  legacy: false, events: [], logs: [], totalOperatingMinutes: 0, totalIdleMinutes: 0, totalMaintenanceMinutes: 0,
  totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0,
  createdAt: "2026-07-20T01:00:00.000Z", updatedAt: "2026-07-20T02:00:00.000Z", ...overrides,
});

describe("DEUR expectation policy normalization", () => {
  it.each([
    policy(), policy({ frequency: "PER_SHIFT", expectedShiftCodes: ["DAY", "NIGHT"] }), policy({ frequency: "ON_DEMAND", expectedShiftCodes: undefined }),
  ])("accepts supported policies as detached serializable values", (input) => {
    const before = structuredClone(input), result = normalizeRentalDeurExpectationPolicy(input);
    expect(result).toMatchObject({ valid: true }); expect(input).toEqual(before);
    if (result.valid) { expect(result.value).not.toBe(input); expect(() => JSON.stringify(result.value)).not.toThrow(); }
  });
  it.each([
    [policy({ frequency: "PER_SHIFT", expectedShiftCodes: [] }), "DEUR_EXPECTATION_SHIFT_REQUIRED"],
    [policy({ frequency: "PER_SHIFT", expectedShiftCodes: ["DAY", "DAY"] }), "DEUR_EXPECTATION_DUPLICATE_SHIFT"],
    [policy({ effectiveFrom: "2026-02-30" }), "DEUR_EXPECTATION_START_INVALID"],
    [policy({ effectiveUntil: "bad" }), "DEUR_EXPECTATION_END_INVALID"],
    [policy({ effectiveUntil: "2026-07-19" }), "DEUR_EXPECTATION_END_INVALID"],
    [policy({ timezone: "Mars/Base" }), "DEUR_EXPECTATION_POLICY_INVALID"],
    [policy({ excludeDates: ["bad"] }), "DEUR_EXPECTATION_POLICY_INVALID"],
    [{ ...policy(), frequency: "WEEKLY" }, "DEUR_EXPECTATION_FREQUENCY_UNSUPPORTED"],
  ])("rejects malformed policy deterministically", (input, code) => expect(normalizeRentalDeurExpectationPolicy(input)).toMatchObject({ valid: false, code }));
  it("normalizes duplicate exclusions and preserves the deterministic capture timestamp", () => {
    expect(normalizeRentalDeurExpectationPolicy(policy({ excludeDates: ["2026-07-22", "2026-07-22"] }))).toMatchObject({ valid: true, value: { excludeDates: ["2026-07-22"], capturedAt: "2026-07-19T00:00:00.000Z" } });
  });
});

describe("deterministic expectation generation", () => {
  it("maps an overnight shift to the local date on which it starts", () => expect(calendarDateAt("2026-07-20T14:00:00.000Z", "Asia/Manila")).toBe("2026-07-20"));
  it("generates included workdays from release through the explicit evaluation boundary without future dates", () => {
    const result = generateRentalDeurExpectations({ rental: rental(), evaluationTimestamp: "2026-07-22T04:00:00.000Z" });
    expect(result.expectations.map((item) => [item.expectationId, item.workDate, item.status])).toEqual([
      ["rental:2026-07-20", "2026-07-20", "DUE"], ["rental:2026-07-21", "2026-07-21", "DUE"], ["rental:2026-07-22", "2026-07-22", "CURRENT"],
    ]);
  });
  it("stops at return/close, excludes dates, and never treats expectedReturn as actual work", () => {
    const result = generateRentalDeurExpectations({ rental: rental({ returnedAt: "2026-07-21T02:00:00.000Z", expectedReturn: "2026-08-30", status: "Returned", deurExpectationPolicy: policy({ excludeDates: ["2026-07-20"] }) }), evaluationTimestamp: "2026-07-25T00:00:00.000Z" });
    expect(result.expectations.map((item) => item.workDate)).toEqual(["2026-07-21"]);
  });
  it("generates configured shifts only with stable identities and no guessed schedule", () => {
    const result = generateRentalDeurExpectations({ rental: rental({ deurExpectationPolicy: policy({ frequency: "PER_SHIFT", expectedShiftCodes: ["DAY", "NIGHT"] }) }), evaluationTimestamp: "2026-07-20T04:00:00.000Z" });
    expect(result.expectations.map((item) => item.expectationId)).toEqual(["rental:2026-07-20:DAY", "rental:2026-07-20:NIGHT"]);
    expect(result.expectations.map((item) => item.status)).toEqual(["CURRENT", "NOT_YET_DUE"]);
  });
  it.each(["Draft", "Reserved", "Cancelled"] as const)("generates nothing for %s rentals", (status) => expect(generateRentalDeurExpectations({ rental: rental({ status }), evaluationTimestamp: "2026-07-22T00:00:00.000Z" }).expectations).toEqual([]));
  it("uses explicit ON_DEMAND and labeled legacy fallback without generating persisted rows", () => {
    expect(generateRentalDeurExpectations({ rental: rental({ deurExpectationPolicy: policy({ frequency: "ON_DEMAND" }) }), evaluationTimestamp: "2026-07-22T00:00:00.000Z" })).toMatchObject({ source: "EXPLICIT_POLICY", expectations: [] });
    expect(generateRentalDeurExpectations({ rental: rental({ deurExpectationPolicy: undefined, deurExpectationPolicyRequired: undefined }), evaluationTimestamp: "2026-07-22T00:00:00.000Z" })).toMatchObject({ source: "LEGACY_RENTAL_FALLBACK", expectations: [], issues: [{ code: "LEGACY_DEUR_EXPECTATION_FALLBACK_USED" }] });
  });
});

describe("policy-aware compliance aggregation", () => {
  it("does not let one compliant date hide another missing date and reports exact counts", () => {
    const result = evaluateRentalDeurCompliance({ rental: rental(), deurs: [deur()], evaluationTimestamp: "2026-07-22T04:00:00.000Z" });
    expect(result).toMatchObject({ source: "EXPLICIT_POLICY", status: "MISSING_DEUR", expectedCount: 3, compliantCount: 1, missingCount: 1, incompleteCount: 0, pendingCorrectionCount: 0 });
  });
  it("does not mark the current local workday missing immediately after release, including near UTC midnight", () => {
    expect(evaluateRentalDeurCompliance({ rental: rental({ status: "Released", releasedAt: "2026-07-20T23:59:00.000Z" }), deurs: [], evaluationTimestamp: "2026-07-21T00:01:00.000Z" })).toMatchObject({ status: "COMPLIANT", missingCount: 0, expectations: [{ status: "CURRENT", reason: "Reporting period is still in progress." }] });
  });
  it("keeps a current-period draft incomplete and marks only a prior completed workday missing", () => {
    expect(evaluateRentalDeurCompliance({ rental: rental(), deurs: [deur({ status: "Draft" })], evaluationTimestamp: "2026-07-20T04:00:00.000Z" })).toMatchObject({ status: "DEUR_INCOMPLETE", incompleteCount: 1, missingCount: 0 });
    expect(evaluateRentalDeurCompliance({ rental: rental(), deurs: [], evaluationTimestamp: "2026-07-21T04:00:00.000Z" })).toMatchObject({ status: "MISSING_DEUR", missingCount: 1 });
  });
  it("uses missing before incomplete and pending correction before missing", () => {
    expect(evaluateRentalDeurCompliance({ rental: rental(), deurs: [deur({ status: "Draft" })], evaluationTimestamp: "2026-07-22T04:00:00.000Z" })).toMatchObject({ status: "MISSING_DEUR", incompleteCount: 1, missingCount: 1 });
    const original = deur({ revision: { chainId: "deur", revisionNumber: 1, originalDeurId: "deur" } });
    const correction = deur({ id: "correction", status: "Submitted", revision: { chainId: "deur", revisionNumber: 2, originalDeurId: "deur", previousRevisionId: "deur" } });
    expect(evaluateRentalDeurCompliance({ rental: rental(), deurs: [original, correction], evaluationTimestamp: "2026-07-21T04:00:00.000Z" })).toMatchObject({ status: "PENDING_CORRECTION", pendingCorrectionCount: 1 });
  });
  it("cannot report false compliance for a required missing or invalid policy", () => {
    expect(evaluateRentalDeurCompliance({ rental: rental({ deurExpectationPolicy: undefined }), deurs: [], evaluationTimestamp: "2026-07-20T04:00:00.000Z" })).toMatchObject({ status: "MISSING_DEUR", issues: [{ code: "DEUR_EXPECTATION_POLICY_REQUIRED" }] });
  });
  it("builds one read-only report row per missing or incomplete expectation", () => {
    const input = { rentals: [rental()], assignments: [], deurs: [deur({ status: "Submitted", deurNumber: "DEUR-000123" })], evaluationTimestamp: "2026-07-22T04:00:00.000Z" };
    const before = structuredClone(input), report = buildRentalDeurComplianceReport(input);
    expect(report.rows).toHaveLength(2);
    expect(report.rows.map((row) => [row.expectation?.workDate, row.expectation?.matchingDeurNumber])).toEqual([["2026-07-20", "DEUR-000123"], ["2026-07-21", undefined]]);
    expect(input).toEqual(before);
  });
});

describe("expectation matching", () => {
  it("matches effective acknowledged manual or digital DEURs by rental, work date, and configured shift", () => {
    const generated = generateRentalDeurExpectations({ rental: rental({ deurExpectationPolicy: policy({ frequency: "PER_SHIFT", expectedShiftCodes: ["DAY", "NIGHT"] }) }), evaluationTimestamp: "2026-07-20T04:00:00.000Z" });
    const matched = matchDeursToExpectations({ expectations: generated.expectations, deurs: [deur({ shift: "Day" }), deur({ id: "manual", shift: "Night", creationSource: "RENTAL_COMPANY_MANUAL" })] });
    expect(matched.results.map((item) => item.status)).toEqual(["COMPLIANT", "COMPLIANT"]);
  });
  it("reports draft/submitted as incomplete, unrelated records as missing, and billed records as compliant", () => {
    const expectations = generateRentalDeurExpectations({ rental: rental(), evaluationTimestamp: "2026-07-20T04:00:00.000Z" }).expectations;
    expect(matchDeursToExpectations({ expectations, deurs: [deur({ status: "Submitted" })] }).results[0].status).toBe("INCOMPLETE");
    expect(matchDeursToExpectations({ expectations, deurs: [deur({ rentalId: "other" })] }).results[0].status).toBe("CURRENT");
    expect(matchDeursToExpectations({ expectations, deurs: [deur({ status: "Billed", billingLocked: true })] }).results[0].status).toBe("COMPLIANT");
  });
  it("uses only the effective correction and marks unresolved correction chains pending", () => {
    const expectations = generateRentalDeurExpectations({ rental: rental(), evaluationTimestamp: "2026-07-20T04:00:00.000Z" }).expectations;
    const original = deur({ revision: { chainId: "deur", revisionNumber: 1, originalDeurId: "deur" } });
    const draft = deur({ id: "correction", status: "Draft", revision: { chainId: "deur", revisionNumber: 2, originalDeurId: "deur", previousRevisionId: "deur" } });
    expect(matchDeursToExpectations({ expectations, deurs: [original, draft] }).results[0].status).toBe("PENDING_CORRECTION");
    expect(matchDeursToExpectations({ expectations, deurs: [original, { ...draft, status: "Rejected" }] }).results[0].status).toBe("COMPLIANT");
  });
  it("moves compliance when an acknowledged correction changes work date or shift", () => {
    const generated = generateRentalDeurExpectations({ rental: rental({ deurExpectationPolicy: policy({ frequency: "PER_SHIFT", expectedShiftCodes: ["DAY", "NIGHT"] }) }), evaluationTimestamp: "2026-07-21T04:00:00.000Z" });
    const original = deur({ shift: "Day", revision: { chainId: "deur", revisionNumber: 1, originalDeurId: "deur", supersededByRevisionId: "corrected" } });
    const corrected = deur({ id: "corrected", workDate: "2026-07-21", shift: "Night", revision: { chainId: "deur", revisionNumber: 2, originalDeurId: "deur", previousRevisionId: "deur", supersedesRevisionId: "deur" } });
    const matched = matchDeursToExpectations({ expectations: generated.expectations, deurs: [original, corrected] });
    expect(matched.results.find((item) => item.workDate === "2026-07-20" && item.shiftCode === "DAY")?.status).toBe("MISSING");
    expect(matched.results.find((item) => item.workDate === "2026-07-21" && item.shiftCode === "NIGHT")?.status).toBe("COMPLIANT");
  });
});
