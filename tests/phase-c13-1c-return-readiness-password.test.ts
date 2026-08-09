import { describe, expect, it } from "vitest";
import type { IStorageService } from "@/core/storage/IStorageService";
import type { User } from "@/features/auth/domain/user";
import { LocalAuthRepository } from "@/features/auth/repository/LocalAuthRepository";
import { LocalUserRepository } from "@/features/auth/repository/LocalUserRepository";
import { AuthorizationError } from "@/features/auth/services/AuthorizationError";
import type { DeurRecord, DeurActivityTypeCanonical } from "@/features/rental/deur/types";
import type { RentalEquipmentLine } from "@/features/rental/equipment-line";
import { getDeurStartEligibility } from "@/features/rental/deur/services/DeurValidationService";
import { evaluateRentalEquipmentLineReturnReadiness } from "@/features/rental/services/evaluateRentalEquipmentLineReturnReadiness";
import { UserManagementService } from "@/features/users/services/UserManagementService";
import type { RentalRecord } from "@/features/rental/types";

class MemoryStorage implements IStorageService {
  values = new Map<string, unknown>();
  get<T>(key: string): T | null { const value = this.values.get(key); return value === undefined ? null : structuredClone(value) as T; }
  set<T>(key: string, value: T): void { this.values.set(key, structuredClone(value)); }
  remove(key: string): void { this.values.delete(key); }
  clear(): void { this.values.clear(); }
}

const admin: User = { id: "admin", username: "admin", displayName: "Admin", systemRoles: ["system-administrator"], status: "active", createdAt: "", updatedAt: "" };
const manager: User = { ...admin, id: "manager", username: "manager", systemRoles: ["management"] };
const operatorUser: User = { ...admin, id: "operator-user", username: "operator.2", displayName: "Operator 2", systemRoles: ["rental-operations"], operatorId: "operator-2" };

const line: RentalEquipmentLine = { id: "line-2", rentalId: "rental-2", equipmentId: "equipment-2", assignmentId: "assignment-2", operatorId: "operator-2", status: "Active", createdAt: "", updatedAt: "" };
const rental = (frequency: "PER_WORKDAY" | "PER_SHIFT" | "ON_DEMAND"): RentalRecord => ({
  id: "rental-2", equipmentId: "equipment-2", customer: "Customer", project: "Project", rentedBy: "Admin", dateOut: "2026-08-09", statusId: "active", status: "Active",
  releasedAt: "2026-08-09T00:00:00Z", deurExpectationPolicyRequired: true,
  deurExpectationPolicy: { frequency, effectiveFrom: "2026-08-09", ...(frequency === "PER_SHIFT" ? { expectedShiftCodes: ["DAY" as const] } : {}), capturedAt: "2026-08-09T00:00:00Z" },
  ...(frequency === "PER_SHIFT" ? { deurShiftWindowSnapshots: [{ code: "DAY", label: "Day", startTime: "08:00", endTime: "17:00", timezone: "UTC", capturedAt: "2026-08-09T00:00:00Z" }] } : {}),
});
const completed = (overrides: Partial<DeurRecord> = {}): DeurRecord => ({ id: "deur-2", deurNumber: "DEUR-000002", rentalId: "rental-2", rentalEquipmentLineId: line.id, equipmentId: line.equipmentId, assignmentId: line.assignmentId, operatorId: line.operatorId, workDate: "2026-08-09", shift: "Day", logs: [], events: [{ id: "s", activityType: "shift", action: "start", timestamp: "2026-08-09T08:00:00Z", sequence: 1, source: "user" }, { id: "e", activityType: "shift", action: "end", timestamp: "2026-08-09T17:00:00Z", sequence: 2, source: "user" }], endOfDay: "2026-08-09T17:00:00Z", totalOperatingMinutes: 60, totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0, status: "Submitted", createdAt: "2026-08-09T08:00:00Z", updatedAt: "2026-08-09T17:00:00Z", ...overrides });
const evaluate = (sourceRental: RentalRecord, deurs: DeurRecord[]) => evaluateRentalEquipmentLineReturnReadiness({ rental: sourceRental, line, deurs, evaluationTimestamp: "2026-08-09T10:00:00Z" });

describe("Phase C13.1C local password administration", () => {
  it("replaces credentials without changing canonical identity and survives repository recreation", () => {
    const storage = new MemoryStorage(); const users = new LocalUserRepository(storage); users.createUser(admin, "Admin123!"); users.createUser(operatorUser, "OldPassword2!");
    const service = new UserManagementService(users, { create: (user, password) => users.createUser(user, password), replacePassword: (id, password) => users.replaceLocalPassword(id, password) });
    const before = users.getUserById(operatorUser.id)!;
    expect(service.resetLocalPassword(admin, operatorUser.id, { newPassword: "Replacement2!", confirmNewPassword: "Replacement2!" })).toMatchObject({ id: before.id, username: before.username, operatorId: before.operatorId, systemRoles: before.systemRoles });
    const reloaded = new LocalUserRepository(storage); const auth = new LocalAuthRepository(storage, reloaded);
    expect(auth.login({ username: operatorUser.username, password: "OldPassword2!" })).toBeNull();
    expect(auth.login({ username: operatorUser.username, password: "Replacement2!" })).toMatchObject({ userId: operatorUser.id });
    expect(reloaded.getUsers()).toHaveLength(2); expect(reloaded.getUserById(operatorUser.id)).not.toHaveProperty("password");
  });
  it("rejects unauthorized, mismatched, weak, missing, and non-local reset attempts", () => {
    const storage = new MemoryStorage(); const users = new LocalUserRepository(storage); users.createUser(admin, "Admin123!"); users.createUser(operatorUser, "OldPassword2!");
    const local = new UserManagementService(users, { create: (user, password) => users.createUser(user, password), replacePassword: (id, password) => users.replaceLocalPassword(id, password) });
    expect(() => local.resetLocalPassword(manager, operatorUser.id, { newPassword: "Replacement2!", confirmNewPassword: "Replacement2!" })).toThrow(AuthorizationError);
    expect(() => local.resetLocalPassword(admin, operatorUser.id, { newPassword: "Replacement2!", confirmNewPassword: "different2" })).toThrow("do not match");
    expect(() => local.resetLocalPassword(admin, operatorUser.id, { newPassword: "weak", confirmNewPassword: "weak" })).toThrow("at least 8");
    expect(() => local.resetLocalPassword(admin, "missing", { newPassword: "Replacement2!", confirmNewPassword: "Replacement2!" })).toThrow("User not found");
    expect(() => new UserManagementService(users, { create: (user) => user }).resetLocalPassword(admin, operatorUser.id, { newPassword: "Replacement2!", confirmNewPassword: "Replacement2!" })).toThrow("Local Authentication Provider");
    expect(users.validateLocalCredentials(operatorUser.username, "OldPassword2!")).toBeDefined();
  });
});

describe("Phase C13.1C policy-aware return readiness", () => {
  it("blocks missing required Per Workday and Per Shift DEURs but permits On Demand zero-DEUR", () => {
    expect(evaluate(rental("PER_WORKDAY"), [])).toMatchObject({ eligible: false, reasonCodes: ["DEUR_REQUIRED", "DEUR_NOT_STARTED"], lineId: line.id });
    expect(evaluate(rental("PER_SHIFT"), [])).toMatchObject({ eligible: false, reasonCodes: ["DEUR_REQUIRED", "DEUR_NOT_STARTED"] });
    expect(evaluate(rental("ON_DEMAND"), [])).toMatchObject({ eligible: true });
  });
  it("blocks Draft, incomplete shift, and every active operational activity", () => {
    expect(evaluate(rental("PER_WORKDAY"), [completed({ status: "Draft" })]).reasonCodes).toContain("DEUR_NOT_SUBMITTED");
    expect(evaluate(rental("PER_WORKDAY"), [completed({ endOfDay: undefined, events: [{ id: "s", activityType: "shift", action: "start", timestamp: "2026-08-09T08:00:00Z", sequence: 1, source: "user" }] })]).reasonCodes).toContain("SHIFT_NOT_COMPLETED");
    for (const activityType of ["operation", "idle", "standby", "breakdown"] satisfies DeurActivityTypeCanonical[]) {
      const record = completed({ status: "In Progress", endOfDay: undefined, events: [{ id: activityType, activityType, action: "start", timestamp: "2026-08-09T09:00:00Z", sequence: 1, source: "user" }] });
      expect(evaluate(rental("PER_WORKDAY"), [record]).reasonCodes).toContain("ACTIVITY_STILL_RUNNING");
    }
  });
  it("permits operationally completed evidence and never lets another line satisfy the expectation", () => {
    expect(evaluate(rental("PER_WORKDAY"), [completed()])).toMatchObject({ eligible: true, deurId: "deur-2" });
    expect(evaluate(rental("PER_WORKDAY"), [completed({ rentalEquipmentLineId: "line-a", equipmentId: "equipment-a" })])).toMatchObject({ eligible: false, reasonCodes: ["DEUR_REQUIRED", "DEUR_NOT_STARTED"] });
  });
  it("keeps normal Returned-rental DEUR creation locked with actionable recovery guidance", () => {
    const result = getDeurStartEligibility({ status: "Returned" });
    expect(result).toMatchObject({ eligible: false }); if (!result.eligible) expect(result.message).toContain("approved recovery process");
  });
});
