import type { User } from "@/features/auth/domain/user";
import { deurRepository } from "../repository/deurRepository";
import type { DeurCommandRepository, DeurLifecycleCommandResult, StartDeurShiftInput, ActivityTransitionInput, CompleteDeurShiftInput, SubmitDeurInput } from "./contracts";

export class LocalDeurCommandRepository implements DeurCommandRepository {
  private readonly versions = new Map<string, number>();
  private readonly results = new Map<string, DeurLifecycleCommandResult>();
  constructor(private readonly currentUser: () => User | null = () => null) {}
  async startShift(input: StartDeurShiftInput): Promise<DeurLifecycleCommandResult> {
    const replay = this.results.get(input.idempotencyKey); if (replay?.success) return { ...replay, disposition: "REPLAYED" };
    const persisted = deurRepository.create(input.draft); this.versions.set(persisted.id, 1);
    const result = accepted(persisted, 1); this.results.set(input.idempotencyKey, result); return result;
  }
  startOrChangeActivity(input: ActivityTransitionInput) { return this.action(input); }
  stopCurrentActivity(input: ActivityTransitionInput) { return this.action({ ...input, action: "END_ACTIVITY" }); }
  async completeShift(input: CompleteDeurShiftInput): Promise<DeurLifecycleCommandResult> {
    return this.action({ ...input, action: "END_SHIFT" });
  }
  async submitDeur(input: SubmitDeurInput): Promise<DeurLifecycleCommandResult> {
    const replay = this.results.get(input.idempotencyKey); if (replay?.success) return { ...replay, disposition: "REPLAYED" };
    const conflict = this.conflict(input.deurId, input.expectedVersion); if (conflict) return conflict;
    const user = this.currentUser(), result = deurRepository.submit(input.deurId, { id: user?.id, name: user?.displayName ?? "Local User" }, user);
    if (!result.success) return rejected("INVALID_TRANSITION", result.message);
    const version = input.expectedVersion + 1; this.versions.set(input.deurId, version);
    const acceptedResult = accepted(result.record, version); this.results.set(input.idempotencyKey, acceptedResult); return acceptedResult;
  }
  private async action(input: ActivityTransitionInput): Promise<DeurLifecycleCommandResult> {
    const replay = this.results.get(input.idempotencyKey); if (replay?.success) return { ...replay, disposition: "REPLAYED" };
    const conflict = this.conflict(input.deurId, input.expectedVersion); if (conflict) return conflict;
    const current = deurRepository.getById(input.deurId); if (!current) return rejected("NOT_FOUND", "DEUR not found.");
    const user = this.currentUser(), result = deurRepository.applyOperatorAction({ deurId: input.deurId, expectedUpdatedAt: current.updatedAt, action: input.action, actionTimestamp: new Date().toISOString(), actor: { id: user?.id, name: user?.displayName ?? "Local User" }, authenticatedUser: user });
    if (!result.success) return rejected(result.code === "DEUR_STALE_VERSION" ? "CONFLICT" : "INVALID_TRANSITION", result.message);
    const version = input.expectedVersion + 1; this.versions.set(input.deurId, version);
    const acceptedResult = accepted(result.record, version); this.results.set(input.idempotencyKey, acceptedResult); return acceptedResult;
  }
  private conflict(id: string, expectedVersion: number): DeurLifecycleCommandResult | undefined {
    const currentVersion = this.versions.get(id) ?? expectedVersion;
    if (currentVersion === expectedVersion) return;
    return { success: false, code: "CONFLICT", message: "The shift was updated from another session. Refreshing the latest record.", retryable: false, refreshRequired: true, aggregateId: id, expectedVersion, currentVersion };
  }
}
function accepted(record: import("../types").DeurRecord, version: number): DeurLifecycleCommandResult { return { success: true, disposition: "ACCEPTED", record, version, serverOccurredAt: new Date().toISOString(), refreshRequired: false }; }
function rejected(code: "NOT_FOUND" | "CONFLICT" | "INVALID_TRANSITION", message: string): DeurLifecycleCommandResult { return { success: false, code, message, retryable: false, refreshRequired: code === "CONFLICT" }; }
