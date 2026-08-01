import type {
  ActivityTransitionInput,
  CompleteDeurShiftInput,
  DeurCommandRepository,
  DeurLifecycleCommandResult,
  StartDeurShiftInput,
  SubmitDeurInput,
} from "@/features/rental/deur/commands/contracts";
import type { DeurOperatorAction } from "@/features/rental/deur/operator/types";
import {
  OFFLINE_OPERATIONAL_COMMAND_SCHEMA_VERSION,
  type OfflineOperationalCommand,
  type OfflineOperationalCommandExecutor,
  type OfflineOperationalCommandQueue,
  type ReplayIdentity,
} from "./offlineQueue";

export const DEUR_OFFLINE_COMMAND_TYPES = [
  "DEUR_START_SHIFT",
  "DEUR_START_OR_CHANGE_ACTIVITY",
  "DEUR_STOP_CURRENT_ACTIVITY",
  "DEUR_COMPLETE_SHIFT",
  "DEUR_SUBMIT",
] as const;
export type DeurOfflineCommandType = typeof DEUR_OFFLINE_COMMAND_TYPES[number];

export type DeurOfflineCommandInput =
  | { type: "DEUR_START_SHIFT"; input: StartDeurShiftInput }
  | { type: "DEUR_START_OR_CHANGE_ACTIVITY"; input: ActivityTransitionInput }
  | { type: "DEUR_STOP_CURRENT_ACTIVITY"; input: ActivityTransitionInput }
  | { type: "DEUR_COMPLETE_SHIFT"; input: CompleteDeurShiftInput }
  | { type: "DEUR_SUBMIT"; input: SubmitDeurInput };

export interface ReplayIdentityValidationContext {
  readonly queued: OfflineOperationalCommand;
}
export interface ReplayIdentityValidator {
  refreshAndValidate(context: ReplayIdentityValidationContext): Promise<ReplayIdentity>;
}
export type DeurGatewayResult =
  | { disposition: "EXECUTED"; result: Extract<DeurLifecycleCommandResult, { success: true }> }
  | { disposition: "QUEUED"; queueItem: OfflineOperationalCommand }
  | { disposition: "REJECTED"; result: Extract<DeurLifecycleCommandResult, { success: false }> };

function queueCommand(command: DeurOfflineCommandInput, identity: ReplayIdentity, tenantId: string): OfflineOperationalCommand {
  const input = command.input;
  return {
    id: input.commandId,
    tenantId,
    userId: identity.userId,
    operatorId: input.operatorId,
    rentalId: input.rentalId,
    rentalLineId: input.rentalLineId,
    deurId: "deurId" in input ? input.deurId : input.draft.id,
    commandType: command.type,
    payload: structuredClone(input) as unknown as Readonly<Record<string, unknown>>,
    idempotencyKey: input.idempotencyKey,
    clientCreatedAt: input.clientCreatedAt ?? new Date().toISOString(),
    attemptCount: 0,
    status: "PENDING",
    schemaVersion: OFFLINE_OPERATIONAL_COMMAND_SCHEMA_VERSION,
  };
}

export class AuthorizedDeurOfflineCommandExecutor implements OfflineOperationalCommandExecutor {
  constructor(
    private readonly repository: DeurCommandRepository,
    private readonly onSucceeded?: (
      command: OfflineOperationalCommand,
      result: Extract<DeurLifecycleCommandResult, { success: true }>,
    ) => Promise<void> | void,
  ) {}

  async execute(command: OfflineOperationalCommand) {
    const input = structuredClone(command.payload) as unknown;
    let result: DeurLifecycleCommandResult;
    switch (command.commandType as DeurOfflineCommandType) {
      case "DEUR_START_SHIFT": result = await this.repository.startShift(input as StartDeurShiftInput); break;
      case "DEUR_START_OR_CHANGE_ACTIVITY": result = await this.repository.startOrChangeActivity(input as ActivityTransitionInput); break;
      case "DEUR_STOP_CURRENT_ACTIVITY": result = await this.repository.stopCurrentActivity(input as ActivityTransitionInput); break;
      case "DEUR_COMPLETE_SHIFT": result = await this.repository.completeShift(input as CompleteDeurShiftInput); break;
      case "DEUR_SUBMIT": result = await this.repository.submitDeur(input as SubmitDeurInput); break;
      default: return { success: false, retryable: false, classification: "VALIDATION" as const };
    }
    if (result.success) {
      await this.onSucceeded?.(command, result);
      return { success: true };
    }
    return {
      success: false,
      retryable: result.retryable,
      classification: result.code === "TRANSPORT_FAILURE" || result.code === "PERSISTENCE_FAILURE"
        ? "TRANSPORT" as const
        : result.code === "UNAUTHENTICATED" ? "AUTHENTICATION_REQUIRED" as const
        : result.code === "UNAUTHORIZED" || result.code === "FORBIDDEN" ? "AUTHORIZATION_EXPIRED" as const
        : result.code === "CONFLICT" || result.code === "IDEMPOTENCY_MISMATCH" ? "CONFLICT" as const
        : "VALIDATION" as const,
    };
  }
}

export class DeurOfflineCommandGateway {
  constructor(
    private readonly repository: DeurCommandRepository,
    private readonly queue: OfflineOperationalCommandQueue,
    private readonly tenantId: string,
  ) {}

  async executeOrQueue(command: DeurOfflineCommandInput, identity: ReplayIdentity): Promise<DeurGatewayResult> {
    if (!identity.authenticated || identity.tenantId !== this.tenantId ||
        identity.operatorId !== command.input.operatorId || !identity.assignmentValid) {
      return {
        disposition: "REJECTED",
        result: { success: false, code: "OWNERSHIP_MISMATCH", message: "The authenticated operator identity no longer matches this command.", retryable: false, refreshRequired: true },
      };
    }
    const result = await this.invoke(command);
    if (result.success) return { disposition: "EXECUTED", result };
    if (result.retryable && (result.code === "TRANSPORT_FAILURE" || result.code === "PERSISTENCE_FAILURE")) {
      const queued = queueCommand(command, identity, this.tenantId);
      await this.queue.enqueue(queued);
      return { disposition: "QUEUED", queueItem: queued };
    }
    return { disposition: "REJECTED", result };
  }

  private invoke(command: DeurOfflineCommandInput): Promise<DeurLifecycleCommandResult> {
    switch (command.type) {
      case "DEUR_START_SHIFT": return this.repository.startShift(command.input);
      case "DEUR_START_OR_CHANGE_ACTIVITY": return this.repository.startOrChangeActivity(command.input);
      case "DEUR_STOP_CURRENT_ACTIVITY": return this.repository.stopCurrentActivity(command.input);
      case "DEUR_COMPLETE_SHIFT": return this.repository.completeShift(command.input);
      case "DEUR_SUBMIT": return this.repository.submitDeur(command.input);
    }
  }
}

export function actionCommandType(action: DeurOperatorAction): DeurOfflineCommandType {
  if (action === "END_SHIFT") return "DEUR_COMPLETE_SHIFT";
  if (action === "END_ACTIVITY") return "DEUR_STOP_CURRENT_ACTIVITY";
  return "DEUR_START_OR_CHANGE_ACTIVITY";
}
