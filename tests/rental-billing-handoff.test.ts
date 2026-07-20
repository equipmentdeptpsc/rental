import { describe, expect, it, vi } from "vitest";

import { executeRentalBillingHandoff, prepareRentalBillingHandoff, type BillingHandoffDependencies } from "@/features/rental/billingstatement/services/executeRentalBillingHandoff";
import type { RentalAggregate } from "@/features/rental/aggregate";
import type { DeurRecord } from "@/features/rental/deur/types";
import type { BillingStatement } from "@/features/rental/billingstatement/types";
import { createRentalCommercialSnapshot } from "@/features/rental/services/createRentalCommercialSnapshot";

function aggregate(overrides: Partial<RentalAggregate> = {}): RentalAggregate {
  return {
    rental: { id: "rental-1", rentalNumber: "R-001", equipmentId: "equipment-1", operatorId: "operator-1", customer: "Customer", project: "Project", rentedBy: "", dateOut: "2026-07-20", statusId: "", status: "Returned" },
    equipment: { id: "equipment-1", prefixId: "", assetNo: "EQ-1", equipmentName: "Excavator", category: "Moving Equipment", maintenanceType: "Engine Hours", currentReading: 0, projectId: "project-1", operatorId: "operator-1", status: "Available" },
    operator: { id: "operator-1", name: "Operator", email: "", licenseNumber: "", certificationType: "None", status: "Active", joinedDate: "" },
    contract: { id: "rental-1", contractNo: "C-1", customerId: "customer-1", equipmentId: "equipment-1", projectId: "project-1", rentalType: "Operated Rental", billingMethod: "Per Hour", currency: "PHP", unitRate: 100, operatorIncluded: true, taxRate: 12, withholdingTax: 2, startDate: "2026-07-20", expectedEndDate: "2026-07-20", status: "Active", createdAt: "2026-07-20T00:00:00.000Z", updatedAt: "2026-07-20T00:00:00.000Z" },
    deurs: [], billing: { totalOperatingCharge: 0, totalIdleCharge: 0, totalMobilizationCharge: 0, totalDemobilizationCharge: 0, totalAdjustment: 0, subtotal: 0, invoiced: 0, collected: 0, outstanding: 0 },
    ...overrides,
  };
}
function deur(id = "deur-1", overrides: Partial<DeurRecord> = {}): DeurRecord {
  return {
    id, deurNumber: id.toUpperCase(), rentalId: "rental-1", equipmentId: "equipment-1", operatorId: "operator-1", workDate: "2026-07-20", logs: [], status: "Acknowledged", legacy: false,
    totalOperatingMinutes: 60, totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0,
    events: [
      { id: "s", activityType: "shift", action: "start", timestamp: "2026-07-20T08:00:00.000Z", sequence: 1, source: "user" },
      { id: "o1", activityType: "operation", action: "start", timestamp: "2026-07-20T09:00:00.000Z", sequence: 2, source: "user" },
      { id: "o2", activityType: "operation", action: "end", timestamp: "2026-07-20T10:00:00.000Z", sequence: 3, source: "user" },
      { id: "e", activityType: "shift", action: "end", timestamp: "2026-07-20T11:00:00.000Z", sequence: 4, source: "user" },
    ], createdAt: "2026-07-20T08:00:00.000Z", updatedAt: "2026-07-20T11:00:00.000Z", ...overrides,
  };
}
function odometerDeur(method: "Per Kilometer" | "Per Trip", source: DeurRecord["creationSource"] = "OPERATOR_DIGITAL") {
  return deur("deur-odometer", {
    creationSource: source, evidenceMode: "ODOMETER_TRIP", billingMethodSnapshot: method, events: [],
    operationalMetadata: { costCode: { code: "5031HEAVYEQPT", name: "Heavy Equipment" }, activityCode: { code: "LDC", name: "Loading" }, workDescription: { name: "MATERIAL HAULING", requiresRemarks: false } },
    odometerTripEvidence: {
      checkpoints: [{ id: "a", location: "Yard", odometerReading: 100 }, { id: "b", location: "Site", odometerReading: 125 }, { id: "c", location: "Dump", odometerReading: 170 }],
      segments: [
        { id: "segment-a-b", startCheckpointId: "a", endCheckpointId: "b", startLocation: "Yard", endLocation: "Site", startOdometer: 100, endOdometer: 125, distance: 25 },
        { id: "segment-b-c", startCheckpointId: "b", endCheckpointId: "c", startLocation: "Site", endLocation: "Dump", startOdometer: 125, endOdometer: 170, distance: 45 },
      ], startingOdometer: 100, endingOdometer: 170, totalDistance: 70, tripCount: 2,
    },
  });
}
function quantityDeur(source:DeurRecord["creationSource"]){const record=deur("deur-quantity",{creationSource:source,evidenceMode:"QUANTITY",billingMethodSnapshot:"Per Cubic Meter",events:[],quantityEvidence:{quantity:18.5,unit:"CUBIC_METER"},operationalMetadata:{costCode:{code:"5031HEAVYEQPT",name:"Heavy Equipment"},activityCode:{code:"LDC",name:"Loading"},workDescription:{name:"MATERIAL HAULING",requiresRemarks:false}}});const configured=aggregate().contract!;const made=createRentalCommercialSnapshot({...configured,billingMethod:"Per Cubic Meter",unitRate:420},"2026-02-27T08:15:00.000Z");if(!made.success)throw Error();record.commercialSnapshot=made.snapshot;record.commercialSnapshotRequired=true;return record}

function harness(source = deur()) {
  const statements: BillingStatement[] = []; const deurs = new Map([[source.id, structuredClone(source)]]); let rentalStatus = "Returned";
  const dependencies: BillingHandoffDependencies = {
    statements: {
      getById: (id) => statements.find((item) => item.id === id), getByRentalId: (id) => statements.filter((item) => item.rentalId === id),
      create: (statement) => { if (!statements.some((item) => item.id === statement.id)) statements.push(structuredClone(statement)); },
      delete: (id) => { const index = statements.findIndex((item) => item.id === id); return index < 0 ? undefined : statements.splice(index, 1)[0]; },
    },
    deurs: { getById: (id) => deurs.get(id), update: (record) => { deurs.set(record.id, structuredClone(record)); return record; } },
    closeRental: () => { if (rentalStatus === "Closed") return { success: true }; rentalStatus = "Closed"; return { success: true }; },
    audit: vi.fn(),
  };
  return { dependencies, statements, deurs, get rentalStatus() { return rentalStatus; } };
}

describe("rental billing handoff review", () => {
  it("creates a detached serializable review for exactly one completed eligible DEUR without mutation", () => {
    const record = deur(); const sourceAggregate = aggregate({ deurs: [record] }); const before = structuredClone(sourceAggregate);
    const prepared = prepareRentalBillingHandoff({ aggregate: sourceAggregate, evaluatedAt: "2026-07-20T11:00:00.000Z" });
    expect(prepared).toMatchObject({ status: "ready", review: { rentalId: "rental-1", deurId: "deur-1", previewStatus: "available", charges: { subtotal: 100, vat: 12, withholdingTax: 2, grandTotal: 110 } } });
    expect(() => JSON.stringify(prepared)).not.toThrow(); expect(sourceAggregate).toEqual(before);
  });

  it.each([
    [deur("d", { status: "In Progress", events: deur().events?.slice(0, 2) }), "NOT_ACKNOWLEDGED"],
    [deur("d"), "UNIT_RATE_REQUIRED"],
    [deur("d", { billingLocked: true }), "BILLING_LOCKED"],
  ] as const)("blocks non-confirmable evidence", (record, expectedCode) => {
    const input = aggregate({ deurs: [record] });
    if (expectedCode === "UNIT_RATE_REQUIRED") input.contract = { ...input.contract!, unitRate: 0 };
    expect(prepareRentalBillingHandoff({ aggregate: input, evaluatedAt: "2026-07-20T11:00:00.000Z" })).toMatchObject({ status: "blocked", issues: [expect.objectContaining({ code: expectedCode })] });
  });

  it("blocks cubic-meter evidence and ambiguous multiple eligible DEURs", () => {
    const cubic = aggregate({ deurs: [deur()] }); cubic.contract = { ...cubic.contract!, billingMethod: "Per Cubic Meter" };
    expect(prepareRentalBillingHandoff({ aggregate: cubic })).toMatchObject({ status: "blocked", issues: [{ code: "EVIDENCE_MODE_MISMATCH" }] });
    expect(prepareRentalBillingHandoff({ aggregate: aggregate({ deurs: [deur("one"), deur("two")] }) })).toMatchObject({ status: "blocked", issues: [{ code: "MULTIPLE_ELIGIBLE_DEURS" }] });
  });
});

describe("rental billing handoff execution", () => {
  it.each(["OPERATOR_DIGITAL","RENTAL_COMPANY_MANUAL"] as const)("hands off %s cubic-meter evidence identically and exactly once",source=>{const record=quantityDeur(source);const input=aggregate({deurs:[record]});input.contract={...input.contract!,billingMethod:"Per Cubic Meter",unitRate:999};const prepared=prepareRentalBillingHandoff({aggregate:input});expect(prepared).toMatchObject({status:"ready",review:{charges:{billingQuantity:18.5,billingUnit:"CUBIC_METER",unitRate:420,operatingCharge:7770}}});if(prepared.status!=="ready")return;const state=harness(record);expect(executeRentalBillingHandoff({aggregate:input,review:prepared.review},state.dependencies)).toMatchObject({status:"created"});expect(state.statements[0].lines[0]).toMatchObject({quantity:18.5,unit:"m³",unitRate:420,billingMethod:"Per Cubic Meter",hours:0,description:"MATERIAL HAULING",amount:7770,commercialTermsSource:"IMMUTABLE_SNAPSHOT"});expect(executeRentalBillingHandoff({aggregate:input,review:prepared.review},state.dependencies)).toMatchObject({status:"already-created"});expect(state.statements).toHaveLength(1)});
  it("uses immutable DEUR commercial terms when the live contract rate changes", () => {
    const live = aggregate(); live.contract = { ...live.contract!, billingMethod: "Per Kilometer", unitRate: 35 };
    const captured = createRentalCommercialSnapshot(live.contract, "2026-02-27T08:15:00.000Z"); if (!captured.success) throw new Error();
    const record = odometerDeur("Per Kilometer"); record.commercialSnapshot = captured.snapshot; record.commercialSnapshotRequired = true;
    live.deurs = [record]; live.contract = { ...live.contract, unitRate: 42, updatedAt:"2026-03-01T00:00:00.000Z" };
    const prepared = prepareRentalBillingHandoff({ aggregate: live }); expect(prepared).toMatchObject({ status: "ready", review: { charges: { unitRate: 35, operatingCharge: 2450 } } });
    if (prepared.status !== "ready") return; const state = harness(record);
    expect(executeRentalBillingHandoff({ aggregate: live, review: prepared.review }, state.dependencies)).toMatchObject({ status: "created", charges: { unitRate: 35, operatingCharge: 2450 } });
    expect(state.statements[0].lines[0]).toMatchObject({ unitRate: 35, amount: 2450, commercialTermsSource: "IMMUTABLE_SNAPSHOT", commercialCapturedAt: "2026-02-27T08:15:00.000Z" });
  });
  it.each([
    ["Per Kilometer", 35, 70, "km", 2450, "OPERATOR_DIGITAL"],
    ["Per Trip", 1500, 2, "trip", 3000, "RENTAL_COMPANY_MANUAL"],
  ] as const)("uses the same semantic evidence and exactly-once handoff for %s", (billingMethod, unitRate, quantity, unit, amount, source) => {
    const record = odometerDeur(billingMethod, source);
    const sourceAggregate = aggregate({ deurs: [record] });
    sourceAggregate.contract = { ...sourceAggregate.contract!, billingMethod, unitRate };
    const prepared = prepareRentalBillingHandoff({ aggregate: sourceAggregate });
    expect(prepared).toMatchObject({ status: "ready", review: { charges: { billingQuantity: quantity, unitRate, operatingCharge: amount } } });
    if (prepared.status !== "ready") return;
    const state = harness(record);
    expect(executeRentalBillingHandoff({ aggregate: sourceAggregate, review: prepared.review }, state.dependencies)).toMatchObject({ status: "created" });
    expect(state.statements[0].lines[0]).toMatchObject({ description: "MATERIAL HAULING", costCode: "5031HEAVYEQPT", activityCode: "LDC", quantity, unit, unitRate, billingMethod, hours: 0, amount });
    expect(executeRentalBillingHandoff({ aggregate: sourceAggregate, review: prepared.review }, state.dependencies)).toMatchObject({ status: "already-created" });
    expect(state.statements).toHaveLength(1);
  });

  it("revalidates, creates one linked statement, consumes only the selected DEUR, and closes afterward", () => {
    const selected = deur(); const unrelated = deur("deur-2"); const sourceAggregate = aggregate({ deurs: [selected] });
    const prepared = prepareRentalBillingHandoff({ aggregate: sourceAggregate }); expect(prepared.status).toBe("ready"); if (prepared.status !== "ready") return;
    const state = harness(selected); state.deurs.set(unrelated.id, unrelated);
    const result = executeRentalBillingHandoff({ aggregate: sourceAggregate, review: prepared.review }, state.dependencies);
    expect(result).toMatchObject({ status: "created", rentalId: "rental-1", deurId: "deur-1", charges: prepared.review.charges });
    expect(state.statements).toHaveLength(1); expect(state.statements[0]).toMatchObject({ rentalId: "rental-1", lines: [{ deurId: "deur-1" }], subtotal: 100, vat: 12, withholdingTax: 2, grandTotal: 110 });
    expect(state.deurs.get("deur-1")).toMatchObject({ billingLocked: true, billingStatementId: state.statements[0].id });
    expect(state.deurs.get("deur-2")).toEqual(unrelated); expect(state.rentalStatus).toBe("Closed");
    expect(state.dependencies.audit).toHaveBeenCalledWith(expect.objectContaining({ type: "handoff-completed", statementId: state.statements[0].id }));
  });

  it("returns review-stale for changed DEUR, rate, or tax with a fresh preview and no writes", () => {
    for (const mutate of [
      (_a: RentalAggregate, d: DeurRecord) => { d.events![2] = { ...d.events![2], timestamp: "2026-07-20T10:30:00.000Z" }; d.updatedAt = "changed"; },
      (a: RentalAggregate) => { a.contract = { ...a.contract!, unitRate: 200 }; },
      (a: RentalAggregate) => { a.contract = { ...a.contract!, taxRate: 15 }; },
    ]) {
      const sourceAggregate = aggregate({ deurs: [deur()] }); const prepared = prepareRentalBillingHandoff({ aggregate: sourceAggregate }); if (prepared.status !== "ready") throw new Error();
      const latest = structuredClone(sourceAggregate); const state = harness(deur()); mutate(latest, state.deurs.get("deur-1")!);
      const result = executeRentalBillingHandoff({ aggregate: latest, review: prepared.review }, state.dependencies);
      expect(result).toMatchObject({ status: "review-stale", latestPreview: expect.any(Object) }); expect(state.statements).toEqual([]);
    }
  });

  it("is exactly-once across repeated execution and repairs a close failure on retry", () => {
    const sourceAggregate = aggregate({ deurs: [deur()] }); const prepared = prepareRentalBillingHandoff({ aggregate: sourceAggregate }); if (prepared.status !== "ready") throw new Error();
    const state = harness(); let closeAttempts = 0;
    state.dependencies.closeRental = () => (++closeAttempts === 1 ? { success: false, message: "close failed" } : { success: true });
    expect(executeRentalBillingHandoff({ aggregate: sourceAggregate, review: prepared.review }, state.dependencies)).toMatchObject({ status: "failed" });
    expect(state.statements).toHaveLength(1);
    expect(executeRentalBillingHandoff({ aggregate: sourceAggregate, review: prepared.review }, state.dependencies)).toMatchObject({ status: "already-created" });
    expect(state.statements).toHaveLength(1); expect(closeAttempts).toBe(2);
  });

  it("failure before persistence changes nothing and audit failure cannot duplicate billing", () => {
    const sourceAggregate = aggregate({ deurs: [deur()] }); const prepared = prepareRentalBillingHandoff({ aggregate: sourceAggregate }); if (prepared.status !== "ready") throw new Error();
    const before = harness(); before.dependencies.checkpoint = (point) => { if (point === "before-statement") throw new Error("stop"); };
    expect(executeRentalBillingHandoff({ aggregate: sourceAggregate, review: prepared.review }, before.dependencies)).toMatchObject({ status: "failed" }); expect(before.statements).toEqual([]);
    const after = harness(); after.dependencies.audit = () => { throw new Error("audit unavailable"); };
    expect(executeRentalBillingHandoff({ aggregate: sourceAggregate, review: prepared.review }, after.dependencies)).toMatchObject({ status: "failed" });
    after.dependencies.audit = vi.fn();
    expect(executeRentalBillingHandoff({ aggregate: sourceAggregate, review: prepared.review }, after.dependencies)).toMatchObject({ status: "already-created" }); expect(after.statements).toHaveLength(1);
  });

  it("repairs a deterministic partial statement left before DEUR consumption", () => {
    const sourceAggregate = aggregate({ deurs: [deur()] }); const prepared = prepareRentalBillingHandoff({ aggregate: sourceAggregate }); if (prepared.status !== "ready") throw new Error();
    const state = harness(); const originalUpdate = state.dependencies.deurs!.update; const originalDelete = state.dependencies.statements!.delete;
    state.dependencies.deurs!.update = () => { throw new Error("DEUR write failed"); };
    state.dependencies.statements!.delete = () => { throw new Error("compensation failed"); };
    expect(executeRentalBillingHandoff({ aggregate: sourceAggregate, review: prepared.review }, state.dependencies)).toMatchObject({ status: "failed" });
    expect(state.statements).toHaveLength(1); expect(state.deurs.get("deur-1")?.billingLocked).toBeUndefined();
    state.dependencies.deurs!.update = originalUpdate; state.dependencies.statements!.delete = originalDelete;
    expect(executeRentalBillingHandoff({ aggregate: sourceAggregate, review: prepared.review }, state.dependencies)).toMatchObject({ status: "already-created" });
    expect(state.statements).toHaveLength(1); expect(state.deurs.get("deur-1")).toMatchObject({ billingLocked: true, billingStatementId: state.statements[0].id });
  });

  it.each([
    ["Per Day", 250], ["Per Week", 250], ["Per Month", 250], ["One Lot", 900],
  ] as const)("preserves %s engine behavior through execution", (billingMethod, expected) => {
    const sourceAggregate = aggregate({ deurs: [deur()] });
    sourceAggregate.contract = { ...sourceAggregate.contract!, billingMethod, unitRate: 250, ...(billingMethod === "One Lot" ? { contractAmount: 900 } : {}) };
    const prepared = prepareRentalBillingHandoff({ aggregate: sourceAggregate }); if (prepared.status !== "ready") throw new Error();
    const state = harness();
    const result = executeRentalBillingHandoff({ aggregate: sourceAggregate, review: prepared.review }, state.dependencies);
    expect(result).toMatchObject({ status: "created", charges: { operatingCharge: expected } });
    expect(state.statements[0].subtotal).toBe(expected);
  });
});
