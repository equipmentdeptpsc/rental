import type { SupabaseClient } from "@supabase/supabase-js";
import type { AddRentalEquipmentInput, AddRentalEquipmentResult, CanonicalCommandResult, CanonicalCommandValue, CanonicalDraftValidationReason, CanonicalReadResult, CanonicalRentalReferenceData, CanonicalRentalReleaseReadiness, CanonicalRentalRemoteRepository, CanonicalRentalReturnEvidence, CanonicalRentalWorkspace, CanonicalVersionedInput, ConfigureCanonicalCustomerReviewInput, CreateCanonicalDraftInput, DecideCanonicalApprovalInput, UpdateCanonicalTermsInput } from "@/features/rental/remote/contracts";

const messages: Record<string, string> = {
  UNAUTHENTICATED: "Your session has expired. Sign in and try again.", FORBIDDEN: "You do not have permission to perform this action.",
  VALIDATION_REJECTED: "The request is incomplete or invalid.", NOT_FOUND: "Referenced Rental information has changed or is unavailable. Refresh and try again.",
  MISSING_RELATIONSHIP: "Referenced Rental information has changed or is unavailable. Refresh and try again.", EQUIPMENT_UNAVAILABLE: "This equipment already has an active or pending Rental.", EQUIPMENT_INTERVAL_CONFLICT: "This equipment is already committed for the requested interval.",
  DUPLICATE_EQUIPMENT_LINE: "This equipment is already included in this Rental.", PARENT_READ_ONLY: "This Rental is read-only and cannot accept additional equipment.", PARENT_STATE_NOT_ELIGIBLE: "Additional equipment is not available in this Rental state.", INVALID_EFFECTIVE_START: "Choose an effective start date within the Rental interval.",
  RENTAL_NUMBER_CONFLICT: "Rental number allocation conflicted. Please retry.", RENTAL_CONFLICT: "This Rental already exists.", CONFLICT: "This Rental changed while you were working. Refresh and try again.",
  LINE_SET_MISMATCH: "The Rental equipment list changed. Refresh and try again.", INVALID_TRANSITION: "This action is not available for the Rental's current state.",
  RELEASE_NOT_READY: "This Rental is not ready for release.", MANAGEMENT_APPROVAL_REQUIRED: "Operations Manager approval is required before this rental can be released.", IDEMPOTENCY_MISMATCH: "This request conflicts with an earlier submission. Refresh before retrying.",
  EXPECTATION_NOT_WAIVABLE: "The selected historical expectation is not eligible for waiver.", EXPECTATION_HAS_DEUR: "A DEUR already exists for this expectation.", ALREADY_WAIVED: "This expectation is already waived.",
  PERSISTENCE_FAILURE: "The remote service could not save the Rental. Refresh before retrying.", TRANSPORT_FAILURE: "Confirmation was not received from the remote service. Refresh before retrying.", INVALID_RESPONSE: "The remote service returned an invalid response.",
};
type RpcClient = Pick<SupabaseClient, "schema">;
type RpcResponse = { data: unknown; error: unknown };
type AbortableRpcRequest = PromiseLike<RpcResponse> & { abortSignal?(signal: AbortSignal): PromiseLike<RpcResponse> };

export const CANONICAL_RENTAL_DRAFT_RPC_TIMEOUT_MILLISECONDS = 20_000;
export const CANONICAL_RENTAL_DRAFT_UNCERTAIN_MESSAGE = "The Rental request did not complete. Please verify the result before retrying.";

export interface CanonicalRentalDraftTransportDiagnostic {
  operation: "command_create_draft_rental";
  state: "STARTED" | "COMPLETED" | "TIMEOUT" | "TRANSPORT_FAILURE";
  startedAt: string;
  elapsedMilliseconds: number;
  httpStatus?: number;
  domainCode?: string;
}

interface CanonicalRentalRepositoryOptions {
  draftTimeoutMilliseconds?: number;
  now?: () => Date;
  setTimeout?: (callback: () => void, milliseconds: number) => ReturnType<typeof globalThis.setTimeout>;
  clearTimeout?: (handle: ReturnType<typeof globalThis.setTimeout>) => void;
  onDraftTransportDiagnostic?: (diagnostic: CanonicalRentalDraftTransportDiagnostic) => void;
}

let lastDraftTransportDiagnostic: CanonicalRentalDraftTransportDiagnostic | undefined;

export function getLastCanonicalRentalDraftTransportDiagnostic(): CanonicalRentalDraftTransportDiagnostic | undefined {
  return lastDraftTransportDiagnostic;
}

export class SupabaseCanonicalRentalRepository implements CanonicalRentalRemoteRepository {
  constructor(private readonly client: RpcClient, private readonly options: CanonicalRentalRepositoryOptions = {}) {}
  async readWorkspace(rentalId: string) {
    const workspace=await this.read<CanonicalRentalWorkspace>("read_canonical_rental_workspace", { target_rental_id: rentalId }, value => ({ rentalId: String(value.rentalId), contracts: array(value.contracts), commercialSnapshots: array(value.commercialSnapshots), expectationDispositions:[] }));
    if(!workspace.success)return workspace;
    const dispositions=await this.read<{expectationDispositions:CanonicalRentalWorkspace["expectationDispositions"]}>("read_deur_expectation_dispositions",{target_rental_id:rentalId},value=>({expectationDispositions:array(value.dispositions)}));
    return dispositions.success?{success:true as const,value:{...workspace.value,...dispositions.value}}:dispositions;
  }
  async readReferenceData() { return this.read<CanonicalRentalReferenceData>("read_canonical_rental_reference_data", {}, value => ({ costCodes: array(value.costCodes), activityCodes: array(value.activityCodes) })); }
  async readReturnEvidence(rentalId: string, rentalEquipmentLineId: string) { return this.read<CanonicalRentalReturnEvidence>("read_rental_return_evidence", { target_rental_id:rentalId, target_rental_equipment_line_id:rentalEquipmentLineId }, value => value as unknown as CanonicalRentalReturnEvidence); }
  async getReleaseReadiness(rentalId: string): Promise<CanonicalReadResult<CanonicalRentalReleaseReadiness>> {
    try {
      const { data, error } = await this.client.schema("erp").rpc("rental_release_readiness", { target_rental_id: rentalId });
      if (error) return failure("TRANSPORT_FAILURE");
      const value = object(data);
      if (!value || typeof value.eligible !== "boolean") return failure("INVALID_RESPONSE");
      const reasonCodes = strings(value.reasonCodes);
      const failureCode = reasonCodes.find(item => item === "UNAUTHENTICATED" || item === "FORBIDDEN" || item === "NOT_FOUND");
      if (failureCode) return failure(failureCode);
      if (typeof value.rentalId !== "string" || !value.rentalId) return failure("INVALID_RESPONSE");
      return {
        success: true,
        value: {
          rentalId: value.rentalId,
          eligible: value.eligible,
          reasonCodes,
          incompleteEquipmentLines: array<Record<string, unknown>>(value.incompleteEquipmentLines).map(line => ({
            rentalEquipmentLineId: typeof line.rentalEquipmentLineId === "string" ? line.rentalEquipmentLineId : "",
            ...(typeof line.equipmentId === "string" ? { equipmentId: line.equipmentId } : {}),
            missingFields: strings(line.missingFields), invalidValues: strings(line.invalidValues),
            ...(typeof line.reasonCode === "string" ? { reasonCode: line.reasonCode } : {}),
          })),
        },
      };
    } catch { return failure("TRANSPORT_FAILURE"); }
  }
  createDraft(input: CreateCanonicalDraftInput) { return this.createDraftWithTransportGuard(input); }
  updateTerms(input: UpdateCanonicalTermsInput) { return this.command("command_update_draft_rental_terms", input); }
  submitApproval(input: CanonicalVersionedInput) { return this.command("command_submit_rental_approval", input); }
  decideApproval(input: DecideCanonicalApprovalInput) { return this.command("command_decide_rental_approval", input); }
  reserve(input: CanonicalVersionedInput) { return this.command("command_reserve_rental", input); }
  release(input: CanonicalVersionedInput) { return this.command("command_release_rental", input); }
  activate(input: CanonicalVersionedInput) { return this.command("command_activate_rental", input); }
  addEquipment(input: AddRentalEquipmentInput): Promise<AddRentalEquipmentResult> { return this.command("command_add_rental_equipment", input) as Promise<AddRentalEquipmentResult>; }
  configureCustomerReview(input: ConfigureCanonicalCustomerReviewInput) { return this.command("command_configure_rental_customer_review", input); }
  waiveDeurExpectation(input: import("@/features/rental/remote/contracts").WaiveDeurExpectationInput) { return this.command("command_waive_deur_expectation", input); }
  private async read<T>(name: string, args: Record<string, unknown>, map: (value: Record<string, unknown>) => T): Promise<CanonicalReadResult<T>> {
    try { const { data, error } = await this.client.schema("erp").rpc(name, args); if (error) return failure("TRANSPORT_FAILURE"); const value = object(data); if (!value || value.success !== true) return failure(code(value?.code)); return { success: true, value: map(value) }; } catch { return failure("TRANSPORT_FAILURE"); }
  }
  private async command(name: string, input: unknown): Promise<CanonicalCommandResult> {
    try { const { data, error } = await this.client.schema("erp").rpc(name, { command: input }); if (error) return approvalGateError(error) ? failure("MANAGEMENT_APPROVAL_REQUIRED") : failure("TRANSPORT_FAILURE"); const value = object(data); if (!value || value.success !== true) return failure(code(value?.code), value); const result = object(value.value); if (!result || typeof result.rentalId !== "string" || (typeof result.version !== "number" && typeof result.waiverId !== "string")) return failure("INVALID_RESPONSE"); return { success: true, disposition: value.disposition === "REPLAYED" ? "REPLAYED" : "ACCEPTED", value: result as unknown as CanonicalCommandValue }; } catch { return failure("TRANSPORT_FAILURE"); }
  }
  private async createDraftWithTransportGuard(input: CreateCanonicalDraftInput): Promise<CanonicalCommandResult> {
    const started = this.now();
    this.recordDraftTransportDiagnostic({ operation: "command_create_draft_rental", state: "STARTED", startedAt: started.toISOString(), elapsedMilliseconds: 0 });
    const controller = typeof AbortController === "undefined" ? undefined : new AbortController();
    let timedOut = false;
    let timeout: ReturnType<typeof globalThis.setTimeout> | undefined;
    const timeoutMilliseconds = this.options.draftTimeoutMilliseconds ?? CANONICAL_RENTAL_DRAFT_RPC_TIMEOUT_MILLISECONDS;
    const timeoutResult = new Promise<never>((_, reject) => {
      timeout = this.setTimer(() => {
        timedOut = true;
        controller?.abort();
        reject(new Error("CANONICAL_RENTAL_DRAFT_RPC_TIMEOUT"));
      }, timeoutMilliseconds);
    });
    try {
      const request = this.client.schema("erp").rpc("command_create_draft_rental", { command: input }) as AbortableRpcRequest;
      const response = await Promise.race([
        Promise.resolve(typeof request.abortSignal === "function" && controller ? request.abortSignal(controller.signal) : request),
        timeoutResult,
      ]);
      if (response.error) {
        this.recordDraftTransportDiagnostic({
          operation: "command_create_draft_rental", state: "TRANSPORT_FAILURE", startedAt: started.toISOString(), elapsedMilliseconds: this.elapsed(started),
          ...(httpStatus(response.error) !== undefined ? { httpStatus: httpStatus(response.error) } : {}),
        });
        return { success: false, code: "TRANSPORT_FAILURE", message: CANONICAL_RENTAL_DRAFT_UNCERTAIN_MESSAGE };
      }
      const outcome = this.commandResult(response.data, response.error);
      this.recordDraftTransportDiagnostic({
        operation: "command_create_draft_rental", state: "COMPLETED", startedAt: started.toISOString(), elapsedMilliseconds: this.elapsed(started),
        ...(httpStatus(response.error) !== undefined ? { httpStatus: httpStatus(response.error) } : {}),
        ...(!outcome.success ? { domainCode: outcome.code } : {}),
      });
      return outcome;
    } catch {
      const state = timedOut ? "TIMEOUT" : "TRANSPORT_FAILURE";
      this.recordDraftTransportDiagnostic({ operation: "command_create_draft_rental", state, startedAt: started.toISOString(), elapsedMilliseconds: this.elapsed(started) });
      return { success: false, code: "TRANSPORT_FAILURE", message: CANONICAL_RENTAL_DRAFT_UNCERTAIN_MESSAGE };
    } finally {
      if (timeout !== undefined) this.clearTimer(timeout);
    }
  }
  private commandResult(data: unknown, error: unknown): CanonicalCommandResult {
    if (error) return failure("TRANSPORT_FAILURE");
    const value = object(data);
    if (!value || value.success !== true) return failure(code(value?.code), value);
    const result = object(value.value);
    if (!result || typeof result.rentalId !== "string" || (typeof result.version !== "number" && typeof result.waiverId !== "string")) return failure("INVALID_RESPONSE");
    return { success: true, disposition: value.disposition === "REPLAYED" ? "REPLAYED" : "ACCEPTED", value: result as unknown as CanonicalCommandValue };
  }
  private now() { return (this.options.now ?? (() => new Date()))(); }
  private elapsed(started: Date) { return Math.max(0, this.now().getTime() - started.getTime()); }
  private setTimer(callback: () => void, milliseconds: number) { return (this.options.setTimeout ?? globalThis.setTimeout)(callback, milliseconds); }
  private clearTimer(handle: ReturnType<typeof globalThis.setTimeout>) { (this.options.clearTimeout ?? globalThis.clearTimeout)(handle); }
  private recordDraftTransportDiagnostic(diagnostic: CanonicalRentalDraftTransportDiagnostic) {
    lastDraftTransportDiagnostic = diagnostic;
    this.options.onDraftTransportDiagnostic?.(diagnostic);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("canonical-rental-draft-transport", { detail: diagnostic }));
  }
}
function object(value: unknown): Record<string, unknown> | undefined { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined; }
function approvalGateError(value: unknown): boolean { return object(value)?.message === "Operations Manager approval is required before this rental can be released."; }
function array<T>(value: unknown): T[] { return Array.isArray(value) ? value as T[] : []; }
function strings(value: unknown): string[] { return array<unknown>(value).filter((item): item is string => typeof item === "string"); }
function code(value: unknown): keyof typeof messages { return typeof value === "string" && value in messages ? value : "INVALID_RESPONSE"; }
function httpStatus(value: unknown): number | undefined { return value && typeof value === "object" && "status" in value && typeof value.status === "number" ? value.status : undefined; }
const draftValidationReasons = new Set<CanonicalDraftValidationReason>(["INVALID_COMMAND", "INVALID_CONTACT", "INVALID_LINE_SET", "INVALID_DATE", "INVALID_IDEMPOTENCY_STATE", "INVALID_LINE_SHAPE"]);
function safeValidationDetails(value: unknown): { reason: CanonicalDraftValidationReason } | undefined {
  const details = object(value);
  const reason = details?.reason;
  return typeof reason === "string" && draftValidationReasons.has(reason as CanonicalDraftValidationReason) ? { reason: reason as CanonicalDraftValidationReason } : undefined;
}
function failure(value: keyof typeof messages, source?: Record<string, unknown>): Extract<CanonicalCommandResult, { success: false }> {
  const validation = value === "VALIDATION_REJECTED" ? safeValidationDetails(source?.details) : undefined;
  return { success: false, code: value as never, message: validation ? `${messages[value]} (${validation.reason})` : messages[value], details: value === "VALIDATION_REJECTED" ? validation : source?.details, currentVersion: typeof source?.currentVersion === "number" ? source.currentVersion : undefined };
}
