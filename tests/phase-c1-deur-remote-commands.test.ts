import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createApplicationDependencies, PersistenceMode } from "@/app/composition";
import { InMemoryDeurCommandRepository } from "@/features/rental/deur/commands/InMemoryDeurCommandRepository";
import type { DeurCommandActor, StartDeurShiftInput } from "@/features/rental/deur/commands/contracts";
import type { DeurRecord } from "@/features/rental/deur/types";
import { LocalDeurCommandRepository } from "@/features/rental/deur/commands/LocalDeurCommandRepository";
import { SupabaseDeurCommandRepository } from "@/integrations/supabase/SupabaseDeurCommandRepository";

const rental = { id: "rental-remote-1", status: "Active" };
const lineA = { id: "line-a", rentalId: rental.id, equipmentId: "excavator", operatorId: "operator-a", assignmentId: "assignment-a", status: "Active" };
const lineB = { id: "line-b", rentalId: rental.id, equipmentId: "dump-truck", operatorId: "operator-b", assignmentId: "assignment-b", status: "Active" };
const assignmentA = { id: "assignment-a", equipmentId: "excavator", operatorId: "operator-a", status: "Active" };
const assignmentB = { id: "assignment-b", equipmentId: "dump-truck", operatorId: "operator-b", status: "Active" };
const operatorA = { id: "operator-a", status: "Active" };
const operatorB = { id: "operator-b", status: "Active" };
const userA: DeurCommandActor = { userId: "user-a", operatorId: "operator-a", permissions: ["deur.create", "deur.review"], status: "active" };
const userB: DeurCommandActor = { userId: "user-b", operatorId: "operator-b", permissions: ["deur.create", "deur.review"], status: "active" };

function draft(id: string, line: typeof lineA): DeurRecord {
  return {
    id, rentalId: rental.id, rentalEquipmentLineId: line.id, assignmentId: line.assignmentId,
    equipmentId: line.equipmentId, operatorId: line.operatorId, creationSource: "OPERATOR_DIGITAL",
    evidenceMode: "TIME_TIMELINE", workDate: "2026-07-29", shift: "Day", events: [], logs: [],
    totalOperatingMinutes: 0, totalIdleMinutes: 0, totalMaintenanceMinutes: 0,
    totalMealBreakMinutes: 0, totalMobilizationMinutes: 0, totalDemobilizationMinutes: 0,
    status: "Draft", billingLocked: false, createdAt: "2026-07-29T00:00:00.000Z", updatedAt: "2026-07-29T00:00:00.000Z",
  };
}
function startInput(id: string, line: typeof lineA, key = `key-${id}`): StartDeurShiftInput {
  return { commandId: `command-${id}`, idempotencyKey: key, rentalId: rental.id, rentalLineId: line.id, equipmentId: line.equipmentId, operatorId: line.operatorId, assignmentId: line.assignmentId, clientCreatedAt: "1999-01-01T00:00:00.000Z", draft: draft(id, line) };
}
function versioned(record: DeurRecord, version: number, key: string) {
  return { commandId: `command-${key}`, idempotencyKey: key, rentalId: record.rentalId, rentalLineId: record.rentalEquipmentLineId!, equipmentId: record.equipmentId, operatorId: record.operatorId, assignmentId: record.assignmentId!, deurId: record.id, expectedVersion: version, clientCreatedAt: "1999-01-01T00:00:00.000Z" };
}
function fixture(actor: () => DeurCommandActor | null, now?: () => string) {
  return new InMemoryDeurCommandRepository({ actor, rentals: [rental], lines: [lineA, lineB], assignments: [assignmentA, assignmentB], operators: [operatorA, operatorB], now });
}

describe("Phase C1 DEUR remote command foundation", () => {
  it("rebuilds the Phase B permission view around the user-role UUID conversion", () => {
    const sql = fs.readFileSync(path.resolve("supabase/migrations/20260729000100_phase_c1_deur_commands.sql"), "utf8");
    const drop = sql.indexOf("DROP VIEW IF EXISTS effective_user_permissions");
    const alter = sql.indexOf("ALTER TABLE user_roles ALTER COLUMN user_id TYPE uuid");
    const recreate = sql.indexOf("CREATE OR REPLACE VIEW effective_user_permissions");
    const grant = sql.indexOf("GRANT SELECT ON effective_user_permissions TO authenticated");
    expect(drop).toBeGreaterThan(-1);
    expect(drop).toBeLessThan(alter);
    expect(alter).toBeLessThan(recreate);
    expect(recreate).toBeLessThan(grant);
    expect(sql).toContain("SELECT ur.user_id, p.code AS permission_code");
  });

  it("selects Local and Supabase command adapters only in the composition root", () => {
    const local = createApplicationDependencies({});
    const remote = createApplicationDependencies({ persistenceMode: "remote", supabaseUrl: "https://example.supabase.co", supabasePublishableKey: "sb_publishable_test_value" });
    expect(local.configuration.persistenceMode).toBe(PersistenceMode.Local);
    expect(local.commandRepositories.deurCommands).toBeInstanceOf(LocalDeurCommandRepository);
    expect(remote.commandRepositories.deurCommands).toBeInstanceOf(SupabaseDeurCommandRepository);
  });

  it("keeps Supabase and environment branching out of DEUR feature/UI command layers", () => {
    const roots = ["src/features/rental/deur", "src/pages/OperatorDeur"];
    const violations = roots.flatMap((root) => files(path.resolve(root))).filter((file) => {
      const source = fs.readFileSync(file, "utf8");
      return /@supabase\/supabase-js|VITE_SUPABASE|VITE_PERSISTENCE_MODE|import\.meta\.env/.test(source);
    });
    expect(violations).toEqual([]);
  });

  it("scopes the two-Operator fixture and persists independent concurrent starts idempotently", async () => {
    let actor: DeurCommandActor | null = userA;
    const repository = fixture(() => actor);
    expect([lineA, lineB].filter((line) => line.operatorId === userA.operatorId)).toEqual([lineA]);
    expect([lineA, lineB].filter((line) => line.operatorId === userB.operatorId)).toEqual([lineB]);
    const inputA = startInput("deur-a", lineA);
    const promiseA = repository.startShift(inputA);
    actor = userB;
    const promiseB = repository.startShift(startInput("deur-b", lineB));
    const [startedA, startedB] = await Promise.all([promiseA, promiseB]);
    expect(startedA).toMatchObject({ success: true, disposition: "ACCEPTED", version: 1 });
    expect(startedB).toMatchObject({ success: true, disposition: "ACCEPTED", version: 1 });
    actor = userA;
    await expect(repository.startShift(inputA)).resolves.toMatchObject({ success: true, disposition: "REPLAYED", record: { id: "deur-a" } });
    expect(repository.snapshot("deur-a")?.record.equipmentId).toBe("excavator");
    expect(repository.snapshot("deur-b")?.record.equipmentId).toBe("dump-truck");
  });

  it("rejects idempotency payload reuse, duplicate shifts, ownership and identity mismatches", async () => {
    let actor: DeurCommandActor | null = userA; const repository = fixture(() => actor);
    const input = startInput("deur-a", lineA, "same-key");
    await repository.startShift(input);
    await expect(repository.startShift({ ...input, equipmentId: "changed" })).resolves.toMatchObject({ success: false, code: "IDEMPOTENCY_MISMATCH" });
    await expect(repository.startShift(startInput("deur-a-duplicate", lineA))).resolves.toMatchObject({ success: false, code: "DUPLICATE_ACTIVE_DEUR" });
    await expect(repository.startShift(startInput("deur-b-owned-by-b", lineB))).resolves.toMatchObject({ success: false, code: "OWNERSHIP_MISMATCH" });
    await expect(repository.startShift({ ...startInput("bad-equipment", lineA), equipmentId: "other" })).resolves.toMatchObject({ success: false, code: "EQUIPMENT_MISMATCH" });
    await expect(repository.startShift({ ...startInput("bad-assignment", lineA), assignmentId: "assignment-b" })).resolves.toMatchObject({ success: false, code: "ASSIGNMENT_MISMATCH" });
    actor = null;
    await expect(repository.startShift(startInput("no-session", lineA))).resolves.toMatchObject({ success: false, code: "UNAUTHENTICATED" });
  });

  it("changes Operation to Idle, isolates lines, rejects stale versions, then completes and submits", async () => {
    const times = ["2026-07-29T01:00:00.000Z", "2026-07-29T01:15:00.000Z", "2026-07-29T01:30:00.000Z", "2026-07-29T02:00:00.000Z", "2026-07-29T02:01:00.000Z"];
    let index = 0, actor: DeurCommandActor | null = userA; const repository = fixture(() => actor, () => times[index++]);
    const started = await repository.startShift(startInput("deur-a", lineA)); expect(started.success).toBe(true); if (!started.success) return;
    actor = userB; const startedB = await repository.startShift(startInput("deur-b", lineB)); expect(startedB.success).toBe(true); if (!startedB.success) return;
    actor = userA;
    const changed = await repository.startOrChangeActivity({ ...versioned(started.record, 1, "idle"), action: "START_IDLE", idleReasonId: "waiting", idleReasonLabelSnapshot: "Waiting for materials" });
    expect(changed).toMatchObject({ success: true, version: 2 }); if (!changed.success) return;
    expect(repository.snapshot("deur-b")?.version).toBe(1);
    await expect(repository.startOrChangeActivity({ ...versioned(started.record, 1, "stale"), action: "START_BREAKDOWN" })).resolves.toMatchObject({ success: false, code: "CONFLICT", expectedVersion: 1, currentVersion: 2, refreshRequired: true });
    const refreshed = repository.snapshot("deur-a")!; expect(refreshed.version).toBe(2);
    const completed = await repository.completeShift({ ...versioned(refreshed.record, 2, "complete"), meterRequirement: "none" });
    expect(completed).toMatchObject({ success: true, version: 3 }); if (!completed.success) return;
    const submitted = await repository.submitDeur(versioned(completed.record, 3, "submit"));
    expect(submitted).toMatchObject({ success: true, version: 4, record: { status: "Submitted" } });
    expect(repository.snapshot("deur-b")?.record.status).toBe("In Progress");
    const acceptedTimes = [started, startedB, changed, completed, submitted].filter((item): item is Extract<typeof item, { success: true }> => item.success).map((item) => item.serverOccurredAt);
    expect(acceptedTimes).toEqual([...acceptedTimes].sort());
  });

  it("transitions every Operator activity without overlap and replays repeated commands exactly once", async () => {
    let tick = 0;
    const repository = fixture(() => userA, () => new Date(Date.UTC(2026, 7, 21, 0, tick++)).toISOString());
    const started = await repository.startShift(startInput("deur-transitions", lineA));
    expect(started.success).toBe(true); if (!started.success) return;
    let record = started.record, version = started.version;
    const transition = async (action: "START_IDLE"|"RESUME_OPERATION"|"START_MEAL_BREAK"|"START_BREAKDOWN"|"END_ACTIVITY", key: string) => {
      const command = { ...versioned(record, version, key), action, ...(action === "START_IDLE" ? { idleReasonId: "waiting", idleReasonLabelSnapshot: "Waiting" } : {}) };
      const result = action === "END_ACTIVITY" ? await repository.stopCurrentActivity(command) : await repository.startOrChangeActivity(command);
      expect(result).toMatchObject({ success: true, version: version + 1 });
      if (!result.success) throw new Error(`${action} failed`);
      const open = result.record.events?.filter(event => event.action === "start" && !result.record.events?.some(candidate => candidate.action === "end" && candidate.activityType === event.activityType && candidate.sequence > event.sequence)) ?? [];
      expect(open.filter(event => event.activityType !== "shift")).toHaveLength(action === "END_ACTIVITY" ? 0 : 1);
      record = result.record; version = result.version;
      return { command, result };
    };
    await transition("START_IDLE", "idle-one");
    await transition("RESUME_OPERATION", "resume-one");
    await transition("START_MEAL_BREAK", "meal-from-operation");
    await transition("START_BREAKDOWN", "breakdown-from-meal");
    await transition("RESUME_OPERATION", "resume-from-breakdown");
    await transition("END_ACTIVITY", "stop-operation");
    await transition("START_IDLE", "idle-two");
    await transition("START_MEAL_BREAK", "meal-from-idle");
    const repeated = await transition("START_BREAKDOWN", "replay-breakdown");
    const replay = await repository.startOrChangeActivity(repeated.command);
    expect(replay).toMatchObject({ success: true, disposition: "REPLAYED", version });
    expect(replay.success && replay.record.events).toHaveLength(record.events?.length ?? 0);
    const completed = await repository.completeShift({ ...versioned(record, version, "end-shift"), meterRequirement: "none" });
    expect(completed).toMatchObject({ success: true, version: version + 1 });
  });

  it("rejects invalid lifecycle, evidence, inactive identities, Finance and Management mutation", async () => {
    let actor: DeurCommandActor | null = userA;
    const mutableAssignment = { ...assignmentA }, mutableOperator = { ...operatorA }, mutableLine = { ...lineA }, mutableRental = { ...rental };
    const repository = new InMemoryDeurCommandRepository({ actor: () => actor, rentals: [mutableRental], lines: [mutableLine], assignments: [mutableAssignment], operators: [mutableOperator] });
    const started = await repository.startShift(startInput("deur-a", lineA)); expect(started.success).toBe(true); if (!started.success) return;
    await expect(repository.submitDeur(versioned(started.record, 1, "early-submit"))).resolves.toMatchObject({ success: false, code: "INVALID_TRANSITION" });
    await expect(repository.completeShift({ ...versioned(started.record, 1, "meter"), meterRequirement: "hourMeter" })).resolves.toMatchObject({ success: false, code: "VALIDATION_REJECTED" });
    actor = { ...userA, status: "inactive" }; await expect(repository.startOrChangeActivity({ ...versioned(started.record, 1, "inactive-user"), action: "START_IDLE" })).resolves.toMatchObject({ success: false, code: "USER_INACTIVE" });
    actor = userA; mutableOperator.status = "Suspended"; await expect(repository.startOrChangeActivity({ ...versioned(started.record, 1, "inactive-operator"), action: "START_IDLE" })).resolves.toMatchObject({ success: false, code: "OPERATOR_INACTIVE" });
    mutableOperator.status = "Active"; mutableAssignment.status = "Completed"; await expect(repository.startOrChangeActivity({ ...versioned(started.record, 1, "inactive-assignment"), action: "START_IDLE" })).resolves.toMatchObject({ success: false, code: "ASSIGNMENT_INACTIVE" });
    mutableAssignment.status = "Active"; mutableLine.status = "Returned"; await expect(repository.startOrChangeActivity({ ...versioned(started.record, 1, "inactive-line"), action: "START_IDLE" })).resolves.toMatchObject({ success: false, code: "RENTAL_LINE_INACTIVE" });
    mutableLine.status = "Active"; mutableRental.status = "Closed"; await expect(repository.startOrChangeActivity({ ...versioned(started.record, 1, "inactive-rental"), action: "START_IDLE" })).resolves.toMatchObject({ success: false, code: "RENTAL_INACTIVE" });
    mutableRental.status = "Active";
    actor = { userId: "finance", permissions: ["billing.read"], status: "active" }; await expect(repository.startOrChangeActivity({ ...versioned(started.record, 1, "finance"), action: "START_IDLE" })).resolves.toMatchObject({ success: false, code: "FORBIDDEN" });
    actor = { userId: "management", permissions: ["dashboard.read"], status: "active" }; await expect(repository.startOrChangeActivity({ ...versioned(started.record, 1, "management"), action: "START_IDLE" })).resolves.toMatchObject({ success: false, code: "FORBIDDEN" });
  });

  it("defines transactional RPC, CAS, idempotency, server time, audit, grants, and scoped RLS", () => {
    const sql = fs.readFileSync(path.resolve("supabase/migrations/20260729000100_phase_c1_deur_commands.sql"), "utf8");
    for (const token of ["command_start_deur_shift", "command_transition_deur_activity", "command_complete_deur_shift", "command_submit_deur", "deur_command_idempotency", "row_version", "FOR UPDATE", "clock_timestamp()", "audit_log", "auth.uid()", "SECURITY DEFINER", "REVOKE INSERT,UPDATE,DELETE", "GRANT EXECUTE", "OWNERSHIP_MISMATCH", "IDEMPOTENCY_MISMATCH", "CONFLICT"]) expect(sql).toContain(token);
    expect(sql).toContain("SET search_path=erp,public,auth");
    expect(sql).toContain("uq_active_deur_line_work_shift");
    expect(sql).toContain("uq_deur_open_primary_activity");
  });
});

function files(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const location = path.join(root, entry.name);
    return entry.isDirectory() ? files(location) : /\.(ts|tsx)$/.test(entry.name) ? [location] : [];
  });
}
