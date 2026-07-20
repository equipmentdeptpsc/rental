import { beforeEach, describe, expect, it } from "vitest";
import { normalizeDeurShiftWindow } from "@/features/rental/deur/shift-window/normalizeDeurShiftWindow";
import { resolveDeurShiftWindowBoundary } from "@/features/rental/deur/shift-window/resolveDeurShiftWindowBoundary";
import { DeurShiftWindowRepository } from "@/features/rental/deur/shift-window/repository";
import { freezeRentalDeurExpectationPolicy } from "@/features/rental/deur/expectation/freezeRentalDeurExpectationPolicy";
import { generateRentalDeurExpectations } from "@/features/rental/deur/expectation/generateRentalDeurExpectations";
import { evaluateRentalDeurCompliance } from "@/features/rental/deur/compliance/evaluateRentalDeurCompliance";
import type { DeurShiftWindowDefinition, RentalRecord } from "@/features/rental/types";

const capturedAt = "2026-07-19T00:00:00.000Z";
const windows: DeurShiftWindowDefinition[] = [
  { code: "DAY", label: "Day Shift", startTime: "08:00", endTime: "17:00", timezone: "Asia/Manila" },
  { code: "NIGHT", label: "Night Shift", startTime: "20:00", endTime: "05:00", timezone: "Asia/Manila" },
];
const rental = (overrides: Partial<RentalRecord> = {}): RentalRecord => ({
  id: "rental", equipmentId: "equipment", customer: "Customer", project: "Project", rentedBy: "Admin", dateOut: "2026-07-20",
  statusId: "reserved", status: "Reserved", deurExpectationPolicyRequired: true,
  deurExpectationPolicy: { frequency: "PER_SHIFT", effectiveFrom: "2026-07-20", expectedShiftCodes: ["DAY", "NIGHT"], timezone: "Asia/Manila", capturedAt },
  ...overrides,
});

describe("controlled shift-window normalization", () => {
  it.each(windows)("accepts a detached serializable $code definition", (input) => {
    const before = structuredClone(input); const result = normalizeDeurShiftWindow(input);
    expect(result).toMatchObject({ valid: true }); expect(input).toEqual(before);
    if (result.valid) { expect(result.value).not.toBe(input); expect(JSON.parse(JSON.stringify(result.value))).toEqual(result.value); }
  });
  it("trims HH:mm values and preserves an explicitly supplied capture timestamp", () => {
    expect(normalizeDeurShiftWindow({ ...windows[0], startTime: " 08:00 ", capturedAt })).toMatchObject({ valid: true, value: { startTime: "08:00", capturedAt } });
  });
  it.each([
    [{ ...windows[0], code: "SWING" }, "SHIFT_WINDOW_CODE_INVALID"], [{ ...windows[0], label: " " }, "SHIFT_WINDOW_LABEL_REQUIRED"],
    [{ ...windows[0], startTime: "8:00" }, "SHIFT_WINDOW_START_INVALID"], [{ ...windows[0], endTime: "24:00" }, "SHIFT_WINDOW_END_INVALID"],
    [{ ...windows[0], endTime: "08:00" }, "SHIFT_WINDOW_ZERO_DURATION"], [{ ...windows[0], timezone: "Mars/Base" }, "SHIFT_WINDOW_TIMEZONE_INVALID"],
  ])("rejects invalid definitions", (input, code) => expect(normalizeDeurShiftWindow(input)).toMatchObject({ valid: false, code }));
});

describe("deterministic shift boundaries", () => {
  it.each([
    [windows[0], "2026-07-19T23:59:00.000Z", "NOT_YET_DUE"], [windows[0], "2026-07-20T00:00:00.000Z", "CURRENT"],
    [windows[0], "2026-07-20T09:00:00.000Z", "DUE"], [windows[1], "2026-07-20T11:59:00.000Z", "NOT_YET_DUE"],
    [windows[1], "2026-07-20T12:00:00.000Z", "CURRENT"], [windows[1], "2026-07-20T20:00:00.000Z", "CURRENT"],
    [windows[1], "2026-07-20T21:00:00.000Z", "DUE"],
  ])("resolves %s at %s", (window, evaluationTimestamp, state) => expect(resolveDeurShiftWindowBoundary({ workDate: "2026-07-20", window, evaluationTimestamp })).toMatchObject({ valid: true, value: { workDate: "2026-07-20", state } }));
  it("places an overnight end on the following local date", () => expect(resolveDeurShiftWindowBoundary({ workDate: "2026-07-20", window: windows[1], evaluationTimestamp: "2026-07-20T20:00:00.000Z" })).toMatchObject({ valid: true, value: { startsAt: "2026-07-20T12:00:00.000Z", endsAt: "2026-07-20T21:00:00.000Z", crossesMidnight: true } }));
});

describe("configuration and immutable release snapshots", () => {
  beforeEach(() => localStorage.clear());
  it("seeds stable defaults once and preserves an edited definition", () => {
    const repository = new DeurShiftWindowRepository("Asia/Manila");
    expect(repository.getAll().map((item) => item.code)).toEqual(["DAY", "NIGHT"]);
    repository.update({ ...windows[0], label: "Site Day", startTime: "07:00" }, capturedAt);
    expect(new DeurShiftWindowRepository("Asia/Manila").getAll()).toContainEqual(expect.objectContaining({ code: "DAY", label: "Site Day", startTime: "07:00" }));
    expect(repository.getAll()).toHaveLength(2);
  });
  it("copies selected windows atomically with deterministic capturedAt", () => {
    const result = freezeRentalDeurExpectationPolicy(rental(), capturedAt, windows);
    expect(result).toMatchObject({ success: true, rental: { deurShiftWindowSnapshots: [{ code: "DAY", capturedAt }, { code: "NIGHT", capturedAt }] } });
    if (result.success) { windows[0].label = "Changed"; expect(result.rental.deurShiftWindowSnapshots?.[0].label).toBe("Day Shift"); }
  });
  it("fails without partial state when a selected window is missing", () => expect(freezeRentalDeurExpectationPolicy(rental(), capturedAt, windows.slice(0, 1))).toMatchObject({ success: false }));
});

describe("PER_SHIFT due state and compliance", () => {
  const released = () => {
    const result = freezeRentalDeurExpectationPolicy(rental(), capturedAt, windows);
    if (!result.success) throw new Error(result.message);
    return { ...result.rental, status: "Active" as const, releasedAt: "2026-07-20T00:00:00.000Z" };
  };
  it("generates independent current-date states from immutable windows", () => {
    const result = generateRentalDeurExpectations({ rental: released(), evaluationTimestamp: "2026-07-20T10:00:00.000Z" });
    expect(result.expectations.map((item) => [item.shiftCode, item.status])).toEqual([["DAY", "DUE"], ["NIGHT", "NOT_YET_DUE"]]);
  });
  it("does not count CURRENT or NOT_YET_DUE as missing", () => expect(evaluateRentalDeurCompliance({ rental: released(), deurs: [], evaluationTimestamp: "2026-07-20T04:00:00.000Z" })).toMatchObject({ status: "COMPLIANT", missingCount: 0 }));
  it("counts only a completed shift as missing", () => expect(evaluateRentalDeurCompliance({ rental: released(), deurs: [], evaluationTimestamp: "2026-07-20T10:00:00.000Z" })).toMatchObject({ status: "MISSING_DEUR", missingCount: 1 }));
  it("labels legacy live fallback and forbids it for new required rentals", () => {
    const legacy = generateRentalDeurExpectations({ rental: rental({ status: "Active", releasedAt: capturedAt, deurExpectationPolicyRequired: undefined }), evaluationTimestamp: "2026-07-20T10:00:00.000Z", liveShiftWindows: windows });
    expect(legacy).toMatchObject({ shiftWindowSource: "LEGACY_LIVE_WINDOW_FALLBACK" });
    expect(generateRentalDeurExpectations({ rental: rental({ status: "Active", releasedAt: capturedAt }), evaluationTimestamp: "2026-07-20T10:00:00.000Z", liveShiftWindows: windows }).issues).toContainEqual(expect.objectContaining({ code: "SHIFT_WINDOW_NOT_CONFIGURED" }));
  });
});
