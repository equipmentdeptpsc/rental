import { applyDigitalDeurOperatorAction } from "../operator/applyDigitalDeurOperatorAction";
import { submitDeur as applySubmission } from "../services/reviewLifecycle";
import type { DeurRecord } from "../types";
import { DEUR_COMMAND_MESSAGES } from "./errorPresentation";
import type {
  ActivityTransitionInput, CompleteDeurShiftInput, DeurCommandActor, DeurCommandFailureCode,
  DeurCommandIdentity, DeurCommandRepository, DeurLifecycleCommandResult, StartDeurShiftInput, SubmitDeurInput,
} from "./contracts";

interface FixtureLine { id: string; rentalId: string; equipmentId: string; operatorId: string; assignmentId: string; status: string }
interface FixtureAssignment { id: string; equipmentId: string; operatorId: string; projectId?: string; status: string }
interface FixtureRental { id: string; status: string }
interface FixtureOperator { id: string; status: string }
export interface InMemoryDeurCommandFixture {
  actor: () => DeurCommandActor | null; rentals: readonly FixtureRental[]; lines: readonly FixtureLine[];
  assignments: readonly FixtureAssignment[]; operators: readonly FixtureOperator[];
  records?: readonly { record: DeurRecord; version: number }[]; now?: () => string;
}

export class InMemoryDeurCommandRepository implements DeurCommandRepository {
  private readonly records = new Map<string, { record: DeurRecord; version: number }>();
  private readonly commands = new Map<string, { actorId: string; type: string; hash: string; result: DeurLifecycleCommandResult }>();
  constructor(private readonly fixture: InMemoryDeurCommandFixture) { fixture.records?.forEach((item) => this.records.set(item.record.id, structuredClone(item))); }
  startShift(input: StartDeurShiftInput) {
    return this.execute("START_SHIFT", input, () => {
      const invalid = this.validateScope(input); if (invalid) return invalid;
      const duplicate = [...this.records.values()].find(({ record }) => record.rentalEquipmentLineId === input.rentalLineId && record.workDate === input.draft.workDate && record.shift === input.draft.shift && ["Draft", "In Progress"].includes(record.status));
      if (duplicate) return failure("DUPLICATE_ACTIVE_DEUR", duplicate.record.id);
      const at = this.now(), record: DeurRecord = structuredClone({ ...input.draft, id: input.draft.id, rentalId: input.rentalId, rentalEquipmentLineId: input.rentalLineId, equipmentId: input.equipmentId, operatorId: input.operatorId, assignmentId: input.assignmentId, status: "In Progress" as const, createdAt: at, updatedAt: at });
      const started = applyDigitalDeurOperatorAction({ deur: record, action: "START_OPERATION", actionTimestamp: at, actor: { id: this.actor()!.userId, name: this.actor()!.userId } });
      const persisted = started.success ? started.record : record; this.records.set(persisted.id, { record: persisted, version: 1 });
      return success(persisted, 1, at);
    });
  }
  startOrChangeActivity(input: ActivityTransitionInput) { return this.transition("ACTIVITY_TRANSITION", input); }
  stopCurrentActivity(input: ActivityTransitionInput) { return this.transition("STOP_ACTIVITY", { ...input, action: "END_ACTIVITY" }); }
  completeShift(input: CompleteDeurShiftInput) {
    return this.execute("COMPLETE_SHIFT", input, () => {
      const current = this.current(input); if (!current.success) return current.result;
      if (input.meterRequirement && input.meterRequirement !== "none" && (!Number.isFinite(input.closingMeter) || input.closingMeter! < 0)) return failure("VALIDATION_REJECTED", input.deurId);
      const at = this.now(), completionRecord = input.closingMeter === undefined ? current.value.record : { ...current.value.record, closingMeter: input.closingMeter };
      const applied = applyDigitalDeurOperatorAction({ deur: completionRecord, action: "END_SHIFT", actionTimestamp: at, actor: { id: this.actor()!.userId, name: this.actor()!.userId }, meterRequirement: input.meterRequirement });
      if (!applied.success) return failure("INVALID_TRANSITION", input.deurId);
      const record = { ...applied.record, updatedAt: at, ...(input.closingMeter === undefined ? {} : { closingMeter: input.closingMeter }) };
      return this.persist(record, current.value.version + 1, at);
    });
  }
  submitDeur(input: SubmitDeurInput) {
    return this.execute("SUBMIT_DEUR", input, () => {
      const current = this.current(input); if (!current.success) return current.result;
      const at = this.now(), submitted = applySubmission(current.value.record, { id: this.actor()!.userId, name: this.actor()!.userId }, at);
      if (!submitted.success) return failure("INVALID_TRANSITION", input.deurId, submitted.message, submitted.issues);
      return this.persist(submitted.record, current.value.version + 1, at);
    });
  }
  snapshot(id: string) { const value = this.records.get(id); return value ? structuredClone(value) : undefined; }
  private transition(type: string, input: ActivityTransitionInput) {
    return this.execute(type, input, () => {
      const current = this.current(input); if (!current.success) return current.result;
      const at = this.now(), applied = applyDigitalDeurOperatorAction({ deur: current.value.record, action: input.action, actionTimestamp: at, actor: { id: this.actor()!.userId, name: this.actor()!.userId } });
      return applied.success ? this.persist(applied.record, current.value.version + 1, at) : failure("INVALID_TRANSITION", input.deurId);
    });
  }
  private async execute(type: string, input: DeurCommandIdentity, operation: () => DeurLifecycleCommandResult): Promise<DeurLifecycleCommandResult> {
    const actor = this.actor(); if (!actor) return failure("UNAUTHENTICATED"); if (actor.status !== "active") return failure("USER_INACTIVE");
    const hash = stableHash({ ...input, idempotencyKey: undefined, commandId: undefined });
    const previous = this.commands.get(input.idempotencyKey);
    if (previous) return previous.actorId === actor.userId && previous.type === type && previous.hash === hash && previous.result.success ? { ...previous.result, disposition: "REPLAYED" } : failure("IDEMPOTENCY_MISMATCH");
    const result = operation();
    if (result.success) this.commands.set(input.idempotencyKey, { actorId: actor.userId, type, hash, result });
    return result;
  }
  private current(input: ActivityTransitionInput | CompleteDeurShiftInput | SubmitDeurInput): { success: true; value: { record: DeurRecord; version: number } } | { success: false; result: DeurLifecycleCommandResult } {
    const invalid = this.validateScope(input); if (invalid) return { success: false, result: invalid };
    const current = this.records.get(input.deurId); if (!current) return { success: false, result: failure("NOT_FOUND", input.deurId) };
    if (current.record.rentalId !== input.rentalId || current.record.rentalEquipmentLineId !== input.rentalLineId || current.record.operatorId !== input.operatorId) return { success: false, result: failure("OWNERSHIP_MISMATCH", input.deurId) };
    if (current.version !== input.expectedVersion) return { success: false, result: { success: false, code: "CONFLICT", message: DEUR_COMMAND_MESSAGES.CONFLICT, retryable: false, refreshRequired: true, aggregateId: input.deurId, expectedVersion: input.expectedVersion, currentVersion: current.version } };
    return { success: true, value: structuredClone(current) };
  }
  private validateScope(input: DeurCommandIdentity): DeurLifecycleCommandResult | undefined {
    const actor = this.actor()!; if (!actor.permissions.includes("deur.create") && !actor.permissions.includes("deur.review")) return failure("FORBIDDEN");
    if (!actor.operatorId || actor.operatorId !== input.operatorId) return failure("OWNERSHIP_MISMATCH");
    const operator = this.fixture.operators.find((item) => item.id === input.operatorId); if (!operator) return failure("NOT_FOUND"); if (operator.status !== "Active") return failure("OPERATOR_INACTIVE");
    const rental = this.fixture.rentals.find((item) => item.id === input.rentalId); if (!rental) return failure("NOT_FOUND"); if (!["Released", "Active"].includes(rental.status)) return failure("RENTAL_INACTIVE");
    const line = this.fixture.lines.find((item) => item.id === input.rentalLineId); if (!line) return failure("NOT_FOUND"); if (!["Released", "Active"].includes(line.status)) return failure("RENTAL_LINE_INACTIVE");
    if (line.rentalId !== input.rentalId) return failure("VALIDATION_REJECTED"); if (line.equipmentId !== input.equipmentId) return failure("EQUIPMENT_MISMATCH"); if (line.operatorId !== input.operatorId) return failure("OPERATOR_MISMATCH"); if (line.assignmentId !== input.assignmentId) return failure("ASSIGNMENT_MISMATCH");
    const assignment = this.fixture.assignments.find((item) => item.id === input.assignmentId); if (!assignment) return failure("NOT_FOUND"); if (assignment.status !== "Active") return failure("ASSIGNMENT_INACTIVE");
    if (assignment.equipmentId !== input.equipmentId || assignment.operatorId !== input.operatorId) return failure("ASSIGNMENT_MISMATCH");
  }
  private persist(record: DeurRecord, version: number, at: string): DeurLifecycleCommandResult { const persisted = { ...record, updatedAt: at }; this.records.set(record.id, { record: persisted, version }); return success(persisted, version, at); }
  private actor() { return this.fixture.actor(); }
  private now() { return this.fixture.now?.() ?? new Date().toISOString(); }
}
function success(record: DeurRecord, version: number, serverOccurredAt: string): DeurLifecycleCommandResult { return { success: true, disposition: "ACCEPTED", record: structuredClone(record), version, serverOccurredAt, refreshRequired: false }; }
function failure(code: DeurCommandFailureCode, aggregateId?: string, message=DEUR_COMMAND_MESSAGES[code], submissionIssues?: Extract<DeurLifecycleCommandResult,{success:false}>["submissionIssues"]): DeurLifecycleCommandResult { return { success: false, code, aggregateId, message, retryable: code === "TRANSPORT_FAILURE", refreshRequired: code === "CONFLICT", ...(submissionIssues?.length?{submissionIssues}:{}) }; }
function stableHash(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableHash).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableHash(item)}`).join(",")}}`;
  return JSON.stringify(value);
}
