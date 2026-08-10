import { beforeEach, describe, expect, it } from "vitest";
import { createLocalApplicationDependencies } from "@/app/composition/createLocalApplicationDependencies";
import { storage } from "@/core/storage";
import { AuthorizationError } from "@/features/auth/services/AuthorizationError";
import { deurRepository } from "@/features/rental/deur/repository/deurRepository";
import type { DeurRecord } from "@/features/rental/deur/types";

const record = (): DeurRecord => ({
  id: "deur-c10", rentalId: "rental-c10", rentalEquipmentLineId: "line-c10",
  assignmentId: "assignment-c10", equipmentId: "equipment-c10", operatorId: "operator-c10",
  creationSource: "OPERATOR_DIGITAL", evidenceMode: "TIME_TIMELINE", workDate: "2026-08-03",
  shift: "Day", events: [], legacy: false, logs: [], totalOperatingMinutes: 0,
  totalIdleMinutes: 0, totalMaintenanceMinutes: 0, totalMealBreakMinutes: 0,
  totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0, status: "Draft",
  billingLocked: false, createdAt: "2026-08-03T00:00:00.000Z", updatedAt: "2026-08-03T00:00:00.000Z",
});

const input = (action: "START_OPERATION" | "START_IDLE") => ({
  commandId: `command-${action}`, idempotencyKey: `key-${action}`,
  rentalId: "rental-c10", rentalLineId: "line-c10", equipmentId: "equipment-c10",
  operatorId: "operator-c10", assignmentId: "assignment-c10", deurId: "deur-c10",
  expectedVersion: 0, clientCreatedAt: "2026-08-03T00:01:00.000Z", action,
  ...(action === "START_IDLE" ? { idleReasonId: "idle-reason-2", idleReasonLabelSnapshot: "Waiting for materials" } : {}),
});

describe("Phase C10 Local operator command authorization", () => {
  beforeEach(() => storage.clear());

  it.each(["START_OPERATION", "START_IDLE"] as const)("uses the canonical rental-operations principal for %s", async (action) => {
    const dependencies = createLocalApplicationDependencies();
    const user = dependencies.authentication.userRepository.getUserByUsername("rental.operations")!;
    dependencies.authentication.userRepository.updateUser({ ...user, operatorId: "operator-c10", updatedAt: "2026-08-03T00:00:00.000Z" });
    expect(dependencies.authentication.authenticationService.login({ providerId: "local", payload: { username: "rental.operations", password: "RentalOperations123!" } })).toMatchObject({ success: true, user: { systemRoles: ["rental-operations"], operatorId: "operator-c10" } });
    deurRepository.create(record());

    await expect(dependencies.commandRepositories.deurCommands.startOrChangeActivity(input(action))).resolves.toMatchObject({ success: true, record: { operatorId: "operator-c10" } });
  });

  it("keeps users without deur.create denied and performs no persistence write", async () => {
    const dependencies = createLocalApplicationDependencies();
    const user = dependencies.authentication.userRepository.getUserByUsername("management")!;
    dependencies.authentication.userRepository.updateUser({ ...user, operatorId: "operator-c10", updatedAt: "2026-08-03T00:00:00.000Z" });
    expect(dependencies.authentication.authenticationService.login({ providerId: "local", payload: { username: "management", password: "Management123!" } })).toMatchObject({ success: true });
    const before = deurRepository.create(record());

    await expect(dependencies.commandRepositories.deurCommands.startOrChangeActivity(input("START_OPERATION"))).rejects.toBeInstanceOf(AuthorizationError);
    expect(deurRepository.getById(before.id)).toEqual(before);
  });

  it("revalidates canonical Idle Reason evidence and rejects changed evidence on replay", async () => {
    const dependencies = createLocalApplicationDependencies();
    const user = dependencies.authentication.userRepository.getUserByUsername("rental.operations")!;
    dependencies.authentication.userRepository.updateUser({ ...user, operatorId: "operator-c10", updatedAt: "2026-08-03T00:00:00.000Z" });
    dependencies.authentication.authenticationService.login({ providerId: "local", payload: { username: "rental.operations", password: "RentalOperations123!" } });
    deurRepository.create(record());
    const other = { ...input("START_IDLE"), idleReasonId: "idle-reason-12", idleReasonLabelSnapshot: "Caller-controlled label" };
    await expect(dependencies.commandRepositories.deurCommands.startOrChangeActivity(other)).resolves.toMatchObject({ success: false, message: expect.stringContaining("Remarks") });
    const accepted = { ...input("START_IDLE"), idleReasonLabelSnapshot: "Caller-controlled label", idleReasonRemarks: "Waiting for dispatch" };
    await expect(dependencies.commandRepositories.deurCommands.startOrChangeActivity(accepted)).resolves.toMatchObject({ success: true, record: { events: expect.arrayContaining([expect.objectContaining({ idleReasonId: "idle-reason-2", idleReasonLabelSnapshot: "Waiting for materials", idleReasonRemarks: "Waiting for dispatch" })]) } });
    await expect(dependencies.commandRepositories.deurCommands.startOrChangeActivity({ ...accepted, idleReasonId: "idle-reason-3" })).resolves.toMatchObject({ success: false, code: "IDEMPOTENCY_MISMATCH" });
  });
});
