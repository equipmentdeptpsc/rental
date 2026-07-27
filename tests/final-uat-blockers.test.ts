import { beforeEach, describe, expect, it } from "vitest";
import { storage } from "@/core/storage";
import { localUatUserId } from "@/features/auth/user";
import { operatorUserLinkRepository, resolveOperatorUserLink } from "@/features/operators/operatorUserLink";
import { resolveAuthenticatedOperator } from "@/features/rental/deur/operator/resolveAuthenticatedOperator";
import { resolveCommercialSummary } from "@/features/rental/commercial/resolveCommercialSummary";
import { createDeurBillingPreview } from "@/features/rental/deur/billing/createDeurBillingPreview";
import { developmentCustomerReviewOutbox } from "@/features/rental/customer-review/developmentCustomerReviewOutbox";
import type { DeurRecord } from "@/features/rental/deur/types";

const operator = { id: "operator-1", name: "Master Operator", email: "op@test.dev", licenseNumber: "L1", certificationType: "Heavy Machinery" as const, status: "Active" as const, joinedDate: "2026-07-27" };
const snapshot = { billingMethod: "Per Hour" as const, unitRate: 100, standbyRate: 25, minimumBillableHours: 0, operatorIncluded: true, currency: "PHP", capturedAt: "2026-07-27T00:00:00.000Z" };
const events: DeurRecord["events"] = [
  { id: "s", activityType: "shift", action: "start", timestamp: "2026-07-27T00:00:00Z", sequence: 1, source: "user" },
  { id: "o1", activityType: "operation", action: "start", timestamp: "2026-07-27T00:00:00Z", sequence: 2, source: "user" },
  { id: "o2", activityType: "operation", action: "end", timestamp: "2026-07-27T02:00:00Z", sequence: 3, source: "user" },
  { id: "i1", activityType: "idle", action: "start", timestamp: "2026-07-27T02:00:00Z", sequence: 4, source: "user" },
  { id: "i2", activityType: "idle", action: "end", timestamp: "2026-07-27T03:00:00Z", sequence: 5, source: "user" },
  { id: "e", activityType: "shift", action: "end", timestamp: "2026-07-27T03:00:00Z", sequence: 6, source: "user" },
];
const deur = (status: DeurRecord["status"]): DeurRecord => ({ id: "d", deurNumber: "DEUR-1", rentalId: "r", rentalEquipmentLineId: "line-1", equipmentId: "e", operatorId: operator.id, workDate: "2026-07-27", status, events, totals: { shiftMinutes: 180, operationMinutes: 120, idleMinutes: 60, mealBreakMinutes: 0, breakdownMinutes: 0 }, logs: [], totalOperatingMinutes: 120, totalIdleMinutes: 60, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0, legacy: false, evidenceMode: "TIME_TIMELINE", billingMethodSnapshot: "Per Hour", commercialSnapshotRequired: true, commercialSnapshot: snapshot, createdAt: "", updatedAt: "" });

describe("final UAT blocker regressions", () => {
  beforeEach(() => localStorage.clear());

  it("persists an explicit login link and distinguishes a deleted mapped Operator", () => {
    operatorUserLinkRepository.link("Operator", operator.id, "2026-07-27T00:00:00Z");
    const user = { id: localUatUserId("Operator", "Operator"), name: "Operator", role: "Operator" as const };
    expect(resolveAuthenticatedOperator(user, [operator])).toMatchObject({ status: "RESOLVED", operator: { id: operator.id } });
    expect(resolveOperatorUserLink(user.id, [])).toMatchObject({ status: "MAPPED_OPERATOR_MISSING" });
    expect(storage.get("equipment-rental-operator-user-links")).not.toBeNull();
  });

  it("presents configured frozen Per Hour charges and preserves intentional zero", () => {
    expect(resolveCommercialSummary(snapshot)).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Operating Rate", value: 100 }),
      expect.objectContaining({ label: "Standby Rate", value: 25 }),
      expect.objectContaining({ label: "Minimum Billable Hours", value: 0 }),
    ]));
  });

  it("shows canonical evidence before acknowledgement and becomes calculable afterward", () => {
    const pending = createDeurBillingPreview({ deur: deur("Submitted"), terms: { billingMethod: "Per Hour", unitRate: 999, standbyRate: 999, operatorIncluded: true }, evaluatedAt: "2026-07-27T04:00:00Z" });
    expect(pending).toMatchObject({ status: "provisional", evidence: { operatingMinutes: 120, idleMinutes: 60 }, commercialTermsSource: "IMMUTABLE_SNAPSHOT" });
    const acknowledged = createDeurBillingPreview({ deur: deur("Acknowledged"), terms: { billingMethod: "Per Hour", unitRate: 999, standbyRate: 999, operatorIncluded: true }, evaluatedAt: "2026-07-27T04:00:00Z" });
    expect(acknowledged).toMatchObject({ status: "available", charges: { operatingCharge: 200, idleCharge: 25 } });
  });

  it("hydrates immutable Customer review requests from Local Storage", () => {
    const created = developmentCustomerReviewOutbox.create({ deurId: "d", deurNumber: "DEUR-1", revisionNumber: 1, rentalNumber: "RENT-1", customerName: "Customer", representativeName: "Rep", representativeEmail: "rep@test.dev", snapshot: { project: "Project", equipment: "Machine", operator: "Operator", workDate: "2026-07-27", operationMinutes: 120, idleMinutes: 60, breakdownMinutes: 0, origin: "OPERATOR_DIGITAL" } });
    expect(developmentCustomerReviewOutbox.getAll()).toEqual([expect.objectContaining({ id: created.id, status: "Pending", html: created.html })]);
  });
});
