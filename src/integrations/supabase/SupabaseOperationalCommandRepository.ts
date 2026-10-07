import type {
  CloseRentalInput, CreateCustomerReviewRequestInput, CreateDeurRevisionInput,
  CustomerReviewCommandRepository, CustomerReviewRequestResult, DeurRevisionCommandRepository,
  DeurRevisionResult, MeterCheckpointCommandRepository, MeterCheckpointResult,
  RepairDeurCorrectionPhysicalOccurrenceInput, RepairDeurCorrectionPhysicalOccurrenceResult,
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
  CollectionLifecycleProjection, RecordCollectionInput,
  DeurConsumptionRecoveryInput, FinancialRecoveryInput, RecoveryCommandRepository,
  RecoveryProjection, RentalRecoveryInput,
  OperationalCommandPhaseObserver, OperationalCommandTransportDiagnostic,
} from "@/features/rental/operations/commands/contracts";
import { isOperationalCommandResult } from "@/features/rental/operations/commands/contracts";

interface RpcError { message: string; code?: string; details?: string; hint?: string; status?: number }
interface RpcClient { schema(name: string): { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: RpcError | null }> } }

function safeRemoteText(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  return value.replace(/(?:password|secret|token|authorization)\s*[:=]\s*\S+/gi, "[REDACTED]").replace(/\s+/g, " ").trim().slice(0, 240);
}

function safeRpcErrorDetails(error: RpcError): Record<string, unknown> | undefined {
  const details: Record<string, unknown> = {};
  if (typeof error.code === "string" && error.code.trim()) details.remoteCode = error.code.trim().slice(0, 80);
  if (typeof error.status === "number" && Number.isInteger(error.status)) details.httpStatus = error.status;
  const message = safeRemoteText(error.message);
  const remoteDetails = safeRemoteText(error.details);
  const hint = safeRemoteText(error.hint);
  if (message) details.remoteMessage = message;
  if (remoteDetails) details.remoteDetails = remoteDetails;
  if (hint) details.remoteHint = hint;
  return Object.keys(details).length ? details : undefined;
}

function safeOperationalDetails(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const allowed = new Set(["reason", "validationCode", "phase", "field", "value", "constraint", "sqlstate", "schema", "table"]);
  const details: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (!allowed.has(key) || (typeof item !== "string" && typeof item !== "number" && typeof item !== "boolean" && item !== null)) continue;
    details[key] = item;
  }
  return Object.keys(details).length ? details : undefined;
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
    ...(safeOperationalDetails(failure.details) ? { details: safeOperationalDetails(failure.details) } : {}),
  };
}

export class SupabaseOperationalCommandRepository implements Repository {
  constructor(private readonly client: RpcClient) {}
  private async rpc<T>(name: string, input: unknown, observe?: OperationalCommandPhaseObserver, normalize?: (value: unknown) => unknown, isValue?: (value: unknown) => value is T): Promise<OperationalCommandResult<T>> {
    const startedAt = Date.now();
    observe?.("RPC_STARTED");
    try {
      const { data, error } = await this.client.schema("erp").rpc(name, { command: input as Record<string, unknown> });
      const elapsedMilliseconds = Date.now() - startedAt;
      if (error) {
        const diagnostic: OperationalCommandTransportDiagnostic = {
          ...(typeof error.code === "string" && error.code.trim() ? { code: error.code.trim().slice(0, 80) } : {}),
          ...(safeRemoteText(error.message) ? { message: safeRemoteText(error.message) } : {}),
          ...(safeRemoteText(error.details) ? { details: safeRemoteText(error.details) } : {}),
          ...(safeRemoteText(error.hint) ? { hint: safeRemoteText(error.hint) } : {}),
          ...(typeof error.status === "number" && Number.isInteger(error.status) ? { status: error.status } : {}),
        };
        observe?.("RPC_ERROR_RECEIVED", elapsedMilliseconds, diagnostic);
        const details = safeRpcErrorDetails(error);
        return {
          success: false,
          code: "TRANSPORT_FAILURE",
          message: details?.remoteMessage ? `Remote command request failed: ${details.remoteMessage}` : "Confirmation was not received from the remote service. Refresh before retrying.",
          retryable: true,
          refreshRequired: true,
          ...(details ? { details } : {}),
        };
      }
      observe?.("RPC_DATA_RECEIVED", elapsedMilliseconds);
      const response = normalize?.(data) ?? data;
      if (!isOperationalCommandResult<T>(response) || (response.success && isValue && !isValue(response.value))) {
        const remoteFailure = normalizeRemoteFailure<T>(response);
        if (remoteFailure) return remoteFailure;
        return { success: false, code: "VALIDATION_REJECTED", message: "The remote command returned an invalid response.", retryable: false, refreshRequired: true };
      }
      return response;
    } catch {
      observe?.("RPC_THROWN", Date.now() - startedAt);
      return { success: false, code: "TRANSPORT_FAILURE", message: "Confirmation was not received from the remote service. Refresh before retrying.", retryable: true, refreshRequired: true };
    }
  }
  createRequest = (input: CreateCustomerReviewRequestInput) => this.rpc<CustomerReviewRequestResult>("command_create_customer_review_request", input);
  acknowledge = (input: PublicReviewDecisionInput) => this.rpc<PublicReviewConfirmation>("public_acknowledge_customer_review", input);
  reject = (input: PublicReviewDecisionInput & { comment: string }) => this.rpc<PublicReviewConfirmation>("public_reject_customer_review", input);
  createCorrection = (input: CreateDeurRevisionInput) => this.rpc<DeurRevisionResult>("command_create_deur_correction", input);
  repairCorrectionPhysicalOccurrence = (input: RepairDeurCorrectionPhysicalOccurrenceInput, observe?: OperationalCommandPhaseObserver) => this.rpc<RepairDeurCorrectionPhysicalOccurrenceResult>("command_repair_manual_deur_correction_physical_occurrence", input, observe);
  record = (input: RecordMeterCheckpointInput) => this.rpc<MeterCheckpointResult>("command_record_meter_checkpoint", input);
  returnLine = (input: ReturnRentalLineInput) => this.rpc<RentalLineReturnProjection>("command_return_rental_line", input, undefined, normalizeLegacyRentalLineReturnFailure, isRentalLineReturnProjection);
  reserveLine = (input: RentalLineLifecycleInput) => this.rpc<RentalLineLifecycleProjection>("command_reserve_rental_line", input);
  releaseLine = (input: RentalLineLifecycleInput) => this.rpc<RentalLineLifecycleProjection>("command_release_rental_line", input);
  activateLine = (input: RentalLineLifecycleInput) => this.rpc<RentalLineLifecycleProjection>("command_activate_rental_line", input);
  cancelLine = (input: RentalLineLifecycleInput) => this.rpc<RentalLineLifecycleProjection>("command_cancel_rental_line", input);
  returnAll = (input: ReturnAllRentalLinesInput) => this.rpc<ReturnAllProjection>("command_return_all_rental_lines", input, undefined, undefined, isReturnAllProjection);
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
  recordCollection = (input: RecordCollectionInput) => this.rpc<CollectionLifecycleProjection>("command_record_collection", input);
  reopenRental = (input: RentalRecoveryInput) => this.rpc<RecoveryProjection>("command_reopen_rental", input);
  reverseRentalReturn = (input: RentalRecoveryInput) => this.rpc<RecoveryProjection>("command_reverse_rental_return", input);
  voidBillingStatement = (input: FinancialRecoveryInput) => this.rpc<RecoveryProjection>("command_void_billing_statement", input);
  releaseDeurConsumption = (input: DeurConsumptionRecoveryInput) => this.rpc<RecoveryProjection>("command_release_deur_consumption", input);
  cancelInvoice = (input: FinancialRecoveryInput) => this.rpc<RecoveryProjection>("command_cancel_invoice", input);
}

function isRentalLineReturnProjection(value: unknown): value is RentalLineReturnProjection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.rentalId === "string"
    && typeof candidate.rentalLineId === "string"
    && typeof candidate.status === "string"
    && typeof candidate.version === "number"
    && (candidate.actualReturnDate === undefined || typeof candidate.actualReturnDate === "string");
}

function isReturnAllProjection(value: unknown): value is ReturnAllProjection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.rentalId === "string"
    && typeof candidate.version === "number"
    && Array.isArray(candidate.lines)
    && candidate.lines.every(isRentalLineReturnProjection);
}

const legacyRentalLineReturnFailureMessages: Record<string, string> = {
  FORBIDDEN: "Rental line return is not authorized.",
  VALIDATION_REJECTED: "The canonical Rental Equipment Line return request was rejected.",
  NOT_FOUND: "Rental or Rental Equipment Line was not found.",
  IDEMPOTENCY_MISMATCH: "Idempotency key payload mismatch.",
  PARENT_READ_ONLY: "Cancelled, Closed, and historical Returned Rentals are read-only.",
  CONFLICT: "Rental Equipment Line version is stale. Refresh before retrying.",
  INVALID_TRANSITION: "The Rental Equipment Line cannot be returned from its current state.",
  PERSISTENCE_FAILURE: "The Rental Equipment Line return could not be persisted. Refresh before retrying.",
};

const rentalLineReturnReasonMessages: Record<string, string> = {
  INVALID_RETURN_DATE: "Return business date is invalid.",
  RETURN_DATE_BEFORE_RENTAL_START: "Return business date cannot be before Rental start.",
  RENTAL_NOT_FOUND: "Rental was not found.",
  LINE_NOT_FOUND: "Rental Equipment Line was not found.",
  LINE_EQUIPMENT_MISMATCH: "Rental Equipment Line does not match the selected equipment.",
  LINE_ASSIGNMENT_MISMATCH: "Rental Equipment Line does not match the selected assignment.",
  COMMAND_INVALID: "Return command is invalid.",
  VERSION_MISMATCH: "Rental Equipment Line version is stale. Refresh before retrying.",
  RETURN_DATE_CONFLICT: "Authoritative Return business date is already recorded and cannot be overwritten.",
  INVALID_LINE_TRANSITION: "Only an Active Rental Equipment Line can be returned.",
  OPEN_DEUR_WORK: "Open DEUR work must be completed before Return.",
  AVAILABLE_EQUIPMENT_STATUS_MISSING: "Available Equipment status is unavailable.",
};

function normalizeLegacyRentalLineReturnFailure(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const candidate = value as Record<string, unknown>;
  if (candidate.success !== false || "message" in candidate || typeof candidate.code !== "string"
    || typeof candidate.retryable !== "boolean" || typeof candidate.refreshRequired !== "boolean") return value;
  const reasonCode = typeof candidate.reasonCode === "string" ? candidate.reasonCode : undefined;
  const message = (reasonCode ? rentalLineReturnReasonMessages[reasonCode] : undefined) ?? legacyRentalLineReturnFailureMessages[candidate.code];
  return message ? { ...candidate, message } : value;
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
