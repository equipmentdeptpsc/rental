import type { SupabaseClient } from "@supabase/supabase-js";
import type { DeurCommandRepository, DeurLifecycleCommandResult, StartDeurShiftInput, ActivityTransitionInput, CompleteDeurShiftInput, SubmitDeurInput } from "@/features/rental/deur/commands/contracts";
import { DEUR_COMMAND_MESSAGES } from "@/features/rental/deur/commands/errorPresentation";
import { mapCanonicalRow } from "./SupabaseReadRepository";
import type { ReadOnlyRepository } from "@/core/remote";
import type { DeurRecord } from "@/features/rental/deur/types";

type RpcName = "command_start_deur_shift" | "command_transition_deur_activity" | "command_complete_deur_shift" | "command_submit_deur";
export class SupabaseDeurCommandRepository implements DeurCommandRepository {
  constructor(private readonly client: SupabaseClient, private readonly deurs?: ReadOnlyRepository<DeurRecord>) {}
  startShift(input: StartDeurShiftInput) { return this.execute("command_start_deur_shift", input); }
  startOrChangeActivity(input: ActivityTransitionInput) { return this.execute("command_transition_deur_activity", input); }
  stopCurrentActivity(input: ActivityTransitionInput) { return this.execute("command_transition_deur_activity", { ...input, action: "END_ACTIVITY" }); }
  completeShift(input: CompleteDeurShiftInput) { return this.execute("command_complete_deur_shift", input); }
  submitDeur(input: SubmitDeurInput) { return this.execute("command_submit_deur", input); }
  private async execute(name: RpcName, input: unknown): Promise<DeurLifecycleCommandResult> {
    try {
      const response = await this.client.schema("erp").rpc(name, { command: input });
      if (response.error) return transportFailure(response.error);
      const result = mapResult(response.data);
      if (!result.success || !this.deurs) return result;
      const refreshed = await this.deurs.getById(result.record.id);
      return refreshed.success && refreshed.value ? { ...result, record: refreshed.value } : result;
    } catch (cause) { return transportFailure(cause); }
  }
}
function mapResult(value: unknown): DeurLifecycleCommandResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) return persistenceFailure();
  const result = value as Record<string, unknown>;
  if (result.success === true && result.record && typeof result.version === "number" && typeof result.serverOccurredAt === "string") {
    const mapped = mapCanonicalRow<import("@/features/rental/deur/types").DeurRecord>(result.record);
    if (!mapped.success) return persistenceFailure();
    return { success: true, disposition: result.disposition === "REPLAYED" ? "REPLAYED" : "ACCEPTED", record: mapped.value, version: result.version, serverOccurredAt: result.serverOccurredAt, refreshRequired: false };
  }
  const code = typeof result.code === "string" && result.code in DEUR_COMMAND_MESSAGES ? result.code as keyof typeof DEUR_COMMAND_MESSAGES : "PERSISTENCE_FAILURE";
  return { success: false, code, message: DEUR_COMMAND_MESSAGES[code], retryable: result.retryable === true, refreshRequired: result.refreshRequired === true, aggregateId: string(result.aggregateId), expectedVersion: number(result.expectedVersion), currentVersion: number(result.currentVersion) };
}
function transportFailure(cause: unknown): DeurLifecycleCommandResult { return { success: false, code: "TRANSPORT_FAILURE", message: DEUR_COMMAND_MESSAGES.TRANSPORT_FAILURE, retryable: true, refreshRequired: false, ...(cause ? {} : {}) }; }
function persistenceFailure(): DeurLifecycleCommandResult { return { success: false, code: "PERSISTENCE_FAILURE", message: DEUR_COMMAND_MESSAGES.PERSISTENCE_FAILURE, retryable: false, refreshRequired: false }; }
function string(value: unknown) { return typeof value === "string" ? value : undefined; }
function number(value: unknown) { return typeof value === "number" ? value : undefined; }
