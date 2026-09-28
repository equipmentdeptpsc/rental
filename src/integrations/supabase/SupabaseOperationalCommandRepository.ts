import type {
  CloseRentalInput, CreateCustomerReviewRequestInput, CreateDeurRevisionInput,
  CustomerReviewCommandRepository, CustomerReviewRequestResult, DeurRevisionCommandRepository,
  DeurRevisionResult, MeterCheckpointCommandRepository, MeterCheckpointResult,
  OperationalCommandRepositories, OperationalCommandResult, PublicReviewConfirmation,
  PublicReviewDecisionInput, RecordMeterCheckpointInput, RentalClosureCommandRepository,
  RentalClosureProjection, RentalClosureReadiness, RentalClosureReadinessInput,
  RentalLineReturnProjection, RentalReturnCommandRepository, RentalReturnReadiness, ReturnAllProjection,
  ReturnAllRentalLinesInput, ReturnRentalLineInput,
  RentalLineLifecycleCommandRepository, RentalLineLifecycleInput, RentalLineLifecycleProjection,
  CreateReservedRentalInput, RentalLifecycleCommandRepository, RentalLifecycleProjection,
  RentalLifecycleTransitionInput,
  BillingCommandInput, BillingConsumptionProjection, BillingEvidenceProjection,
  BillingFinancialCommandRepository, BillingLifecycleProjection, ConsumeDeurInput,
  CreateBillingStatementInput, GenerateBillingEvidenceInput, UpdateInvoiceInput,
  DeurConsumptionRecoveryInput, FinancialRecoveryInput, RecoveryCommandRepository,
  RecoveryProjection, RentalRecoveryInput,
} from "@/features/rental/operations/commands/contracts";
import { isOperationalCommandResult } from "@/features/rental/operations/commands/contracts";

interface RpcClient { schema(name: string): { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> } }

const correctionFailureMessages: Record<string, string> = {
  FORBIDDEN: "You do not have permission to create a DEUR correction.",
  VALIDATION_REJECTED: "The DEUR correction request is incomplete or invalid.",
  NOT_FOUND: "The source DEUR is unavailable.",
  CONFLICT: "The source DEUR changed. Refresh before retrying.",
  INVALID_TRANSITION: "The DEUR cannot be corrected in its current state.",
  IDEMPOTENCY_MISMATCH: "This correction request conflicts with an earlier submission.",
};

function safeCorrectionDetails(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const allowed = new Set(["reason", "validationCode", "phase", "field", "value", "constraint", "sqlstate", "schema", "table"]);
  const details: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!allowed.has(key) || (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean" && item !== null)) continue;
    details[key] = item;
  }
  return Object.keys(details).length ? details : undefined;
}

function normalizeCorrectionResponse(data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const source = data as Record<string, unknown>;
  if (source.success !== false || typeof source.code !== "string") return data;
  const normalized: Record<string, unknown> = {
    ...source,
    message: typeof source.message === "string" ? source.message : correctionFailureMessages[source.code] ?? "The DEUR correction was rejected.",
    retryable: typeof source.retryable === "boolean" ? source.retryable : false,
    refreshRequired: typeof source.refreshRequired === "boolean" ? source.refreshRequired : source.code === "CONFLICT",
  };
  const details = safeCorrectionDetails(source.details);
  if (details) normalized.details = details;
  else delete normalized.details;
  return normalized;
}

type Repository = CustomerReviewCommandRepository & DeurRevisionCommandRepository &
  MeterCheckpointCommandRepository & RentalReturnCommandRepository & RentalClosureCommandRepository &
  RentalLifecycleCommandRepository & BillingFinancialCommandRepository & RecoveryCommandRepository;

function normalizeRemoteFailure<T>(data: unknown): OperationalCommandResult<T> | undefined {
  if (!data || typeof data !== "object") return undefined;
  const failure = data as Record<string, unknown>;
  if (failure.success !== false || typeof failure.code !== "string") return undefined;
  const message = typeof failure.message === "string" ? failure.message : "The remote command was rejected.";
  return {
    success: false,
    code: failure.code as OperationalCommandResult<T> extends { success: false; code: infer Code } ? Code : never,
    message,
    retryable: typeof failure.retryable === "boolean" ? failure.retryable : false,
    refreshRequired: typeof failure.refreshRequired === "boolean" ? failure.refreshRequired : failure.code === "CONFLICT",
    ...(typeof failure.currentVersion === "number" ? { currentVersion: failure.currentVersion } : {}),
  };
}

export class SupabaseOperationalCommandRepository implements Repository {
  constructor(private readonly client: RpcClient) {}
  private async rpc<T>(name: string, input: unknown): Promise<OperationalCommandResult<T>> {
    const { data, error } = await this.client.schema("erp").rpc(name, { command: input as Record<string, unknown> });
    if (error) return { success: false, code: "TRANSPORT_FAILURE", message: "Confirmation was not received from the remote service. Refresh before retrying.", retryable: true, refreshRequired: true };
    if (!isOperationalCommandResult<T>(data)) {
      const remoteFailure = normalizeRemoteFailure<T>(data);
      if (remoteFailure) return remoteFailure;
      return { success: false, code: "VALIDATION_REJECTED", message: "The remote command returned an invalid response.", retryable: false, refreshRequired: true };
    }
    return data;
  }
  createRequest = (input: CreateCustomerReviewRequestInput) => this.rpc<CustomerReviewRequestResult>("command_create_customer_review_request", input);
  acknowledge = (input: PublicReviewDecisionInput) => this.rpc<PublicReviewConfirmation>("public_acknowledge_customer_review", input);
  reject = (input: PublicReviewDecisionInput & { comment: string }) => this.rpc<PublicReviewConfirmation>("public_reject_customer_review", input);
  createCorrection = (input: CreateDeurRevisionInput) => this.rpc<DeurRevisionResult>("command_create_deur_correction", input, normalizeCorrectionResponse);
  record = (input: RecordMeterCheckpointInput) => this.rpc<MeterCheckpointResult>("command_record_meter_checkpoint", input);
  returnLine = (input: ReturnRentalLineInput) => this.rpc<RentalLineReturnProjection>("command_return_rental_line", input);
  reserveLine = (input: RentalLineLifecycleInput) => this.rpc<RentalLineLifecycleProjection>("command_reserve_rental_line", input);
  releaseLine = (input: RentalLineLifecycleInput) => this.rpc<RentalLineLifecycleProjection>("command_release_rental_line", input);
  activateLine = (input: RentalLineLifecycleInput) => this.rpc<RentalLineLifecycleProjection>("command_activate_rental_line", input);
  cancelLine = (input: RentalLineLifecycleInput) => this.rpc<RentalLineLifecycleProjection>("command_cancel_rental_line", input);
  returnAll = (input: ReturnAllRentalLinesInput) => this.rpc<ReturnAllProjection>("command_return_all_rental_lines", input);
  getReturnReadiness = (input: { rentalId: string }) => this.rpc<RentalReturnReadiness>("get_rental_return_readiness", input);
  getReadiness = (input: RentalClosureReadinessInput) => this.rpc<RentalClosureReadiness>("get_rental_closure_readiness", input);
  close = (input: CloseRentalInput) => this.rpc<RentalClosureProjection>("command_close_rental", input);
  createReserved = (input: CreateReservedRentalInput) => this.rpc<RentalLifecycleProjection>("command_create_reserved_rental", input);
  release = (input: RentalLifecycleTransitionInput) => this.rpc<RentalLifecycleProjection>("command_release_rental", input);
  activate = (input: RentalLifecycleTransitionInput) => this.rpc<RentalLifecycleProjection>("command_activate_rental", input);
  cancel = (input: RentalLifecycleTransitionInput) => this.rpc<RentalLifecycleProjection>("command_cancel_rental", input);
  generateEvidence = (input: GenerateBillingEvidenceInput) => this.rpc<BillingEvidenceProjection>("command_generate_billing_evidence", input);
  createStatement = (input: CreateBillingStatementInput) => this.rpc<BillingLifecycleProjection>("command_create_billing_statement", input);
  consumeDeur = (input: ConsumeDeurInput) => this.rpc<BillingConsumptionProjection>("command_consume_deur", input);
  finalizeStatement = (input: BillingCommandInput) => this.rpc<BillingLifecycleProjection>("command_finalize_billing_statement", input);
  createInvoice = (input: BillingCommandInput) => this.rpc<BillingLifecycleProjection>("command_create_invoice", input);
  updateInvoice = (input: UpdateInvoiceInput) => this.rpc<BillingLifecycleProjection>("command_update_invoice", input);
  reopenRental = (input: RentalRecoveryInput) => this.rpc<RecoveryProjection>("command_reopen_rental", input);
  reverseRentalReturn = (input: RentalRecoveryInput) => this.rpc<RecoveryProjection>("command_reverse_rental_return", input);
  voidBillingStatement = (input: FinancialRecoveryInput) => this.rpc<RecoveryProjection>("command_void_billing_statement", input);
  releaseDeurConsumption = (input: DeurConsumptionRecoveryInput) => this.rpc<RecoveryProjection>("command_release_deur_consumption", input);
  cancelInvoice = (input: FinancialRecoveryInput) => this.rpc<RecoveryProjection>("command_cancel_invoice", input);
}

export function createSupabaseOperationalCommands(client: RpcClient): OperationalCommandRepositories {
  const repository = new SupabaseOperationalCommandRepository(client);
  return {
    customerReviewCommands: repository, deurRevisionCommands: repository,
    meterCheckpointCommands: repository, rentalReturnCommands: repository,
    rentalClosureCommands: repository,
    rentalLifecycleCommands: repository,
    billingFinancialCommands: repository,
    recoveryCommands: repository,
  };
}

export function createSupabaseRentalReturnCommands(client: RpcClient): RentalReturnCommandRepository {
  return new SupabaseOperationalCommandRepository(client);
}

export function createSupabaseRentalCancellationCommands(client: RpcClient): Pick<RentalLifecycleCommandRepository, "cancel"> {
  const repository = new SupabaseOperationalCommandRepository(client);
  return { cancel: repository.cancel };
}

export function createSupabaseRentalLineLifecycleCommands(client: RpcClient, enabled: { reserve: boolean; release: boolean; activate: boolean; cancel: boolean; return: boolean }): Partial<RentalLineLifecycleCommandRepository> {
  const repository = new SupabaseOperationalCommandRepository(client);
  return {
    ...(enabled.reserve ? { reserveLine: repository.reserveLine } : {}),
    ...(enabled.release ? { releaseLine: repository.releaseLine } : {}),
    ...(enabled.activate ? { activateLine: repository.activateLine } : {}),
    ...(enabled.cancel ? { cancelLine: repository.cancelLine } : {}),
    ...(enabled.return ? { returnLine: repository.returnLine } : {}),
  };
}

export function createSupabaseRentalClosureCommands(client: RpcClient): RentalClosureCommandRepository {
  const repository = new SupabaseOperationalCommandRepository(client);
  return { getReadiness: repository.getReadiness, close: repository.close };
}
