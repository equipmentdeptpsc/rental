import type { CreateProjectCommand, ProjectCommandRepository, ProjectCreationProjection, ProjectCustomerLinkProjection, ProjectReviewRecipientProjection, UpdateProjectCustomerCommand, UpdateProjectReviewRecipientsCommand } from "@/features/project/commands/contracts";
import { isOperationalCommandResult, type OperationalCommandResult } from "@/features/rental/operations/commands/contracts";

interface ProjectRpcClient {
  schema(name: string): { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };
}

export class SupabaseProjectCommandRepository implements ProjectCommandRepository {
  constructor(private readonly client: ProjectRpcClient) {}

  async createProject(command: CreateProjectCommand): Promise<OperationalCommandResult<ProjectCreationProjection>> {
    const { data, error } = await this.client.schema("erp").rpc("command_create_project", { command });
    if (error) return { success: false, code: "TRANSPORT_FAILURE", message: "Confirmation was not received from the remote service. Refresh before retrying.", retryable: true, refreshRequired: true };
    const candidate = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : undefined;
    if (candidate?.success === false && typeof candidate.code === "string") return { success: false, code: candidate.code as Extract<OperationalCommandResult<ProjectCreationProjection>, { success: false }>["code"], message: failureMessage(candidate.code), retryable: false, refreshRequired: ["CONFLICT", "PROJECT_CODE_CONFLICT", "PERSISTENCE_FAILURE"].includes(candidate.code) };
    if (!isOperationalCommandResult<ProjectCreationProjection>(data) || (data.success && !isProjection(data.value))) return { success: false, code: "VALIDATION_REJECTED", message: "The remote Project command returned an invalid response.", retryable: false, refreshRequired: true };
    return data;
  }

  async updateProjectCustomer(command: UpdateProjectCustomerCommand): Promise<OperationalCommandResult<ProjectCustomerLinkProjection>> {
    const { data, error } = await this.client.schema("erp").rpc("command_update_project_customer", { command });
    if (error) return { success: false, code: "TRANSPORT_FAILURE", message: "Confirmation was not received from the remote service. Refresh before retrying.", retryable: true, refreshRequired: true };
    const candidate = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : undefined;
    if (candidate?.success === false && typeof candidate.code === "string") return { success: false, code: candidate.code as Extract<OperationalCommandResult<ProjectCustomerLinkProjection>, { success: false }>["code"], message: customerLinkFailureMessage(candidate.code), retryable: false, refreshRequired: ["CONFLICT", "NOT_FOUND", "PERSISTENCE_FAILURE"].includes(candidate.code) };
    if (!isOperationalCommandResult<ProjectCustomerLinkProjection>(data) || (data.success && !isCustomerLinkProjection(data.value))) return { success: false, code: "VALIDATION_REJECTED", message: "The remote Project customer-link command returned an invalid response.", retryable: false, refreshRequired: true };
    return data;
  }

  async readProjectReviewRecipients(projectId: string): Promise<{ success: true; value: ProjectReviewRecipientProjection } | { success: false; message: string }> {
    const { data, error } = await this.client.schema("erp").rpc("read_project_customer_review_recipients", { target_project_id: projectId });
    if (error || !isReviewRecipientProjection(data)) return { success: false, message: "Project reviewers could not be loaded. Refresh and try again." };
    return { success: true, value: data };
  }

  async updateProjectReviewRecipients(command: UpdateProjectReviewRecipientsCommand): Promise<OperationalCommandResult<ProjectReviewRecipientProjection>> {
    const { data, error } = await this.client.schema("erp").rpc("command_update_project_customer_review_recipients", { command });
    if (error) return { success: false, code: "TRANSPORT_FAILURE", message: "The reviewer update could not be confirmed. Refresh before retrying.", retryable: true, refreshRequired: true };
    const candidate = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : undefined;
    if (candidate?.success === false && typeof candidate.code === "string") return { success: false, code: candidate.code, message: reviewRecipientFailureMessage(candidate.code), retryable: false, refreshRequired: candidate.code === "CONFLICT" };
    if (!isOperationalCommandResult<ProjectReviewRecipientProjection>(data) || (data.success && !isReviewRecipientProjection(data.value))) return { success: false, code: "VALIDATION_REJECTED", message: "The reviewer update returned an invalid response.", retryable: false, refreshRequired: true };
    return data;
  }
}

function reviewRecipientFailureMessage(code: string) {
  const messages: Record<string, string> = {
    UNAUTHENTICATED: "Your session has expired. Sign in and try again.",
    FORBIDDEN: "You do not have permission to update Project reviewers.",
    VALIDATION_REJECTED: "Enter up to ten reviewers with distinct valid email addresses and names.",
    NOT_FOUND: "The linked Project is unavailable. Refresh and try again.",
    CONFLICT: "Project reviewers changed. Refresh before saving again.",
    IDEMPOTENCY_MISMATCH: "This request conflicts with an earlier update. Refresh before retrying.",
    PERSISTENCE_FAILURE: "Project reviewers could not be saved. Refresh before retrying.",
  };
  return messages[code] ?? "The Project reviewer update was rejected.";
}

function isReviewRecipientProjection(value: unknown): value is ProjectReviewRecipientProjection {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.projectId === "string" && Number.isInteger(row.rowVersion) && Array.isArray(row.recipients)
    && row.recipients.every((entry: unknown) => Boolean(entry && typeof entry === "object" && !Array.isArray(entry)
      && typeof (entry as Record<string, unknown>).name === "string" && typeof (entry as Record<string, unknown>).email === "string"));
}

function failureMessage(code: string) {
  const messages: Record<string, string> = {
    UNAUTHENTICATED: "Your session has expired. Sign in and try again.",
    FORBIDDEN: "You do not have permission to create Projects.",
    VALIDATION_REJECTED: "Enter a valid Project Code and Project Name.",
    CUSTOMER_INVALID: "The selected Customer is unavailable for this Project.",
    PROJECT_CODE_CONFLICT: "Project code already exists.",
    CONFLICT: "The Project identity is already in use.",
    IDEMPOTENCY_MISMATCH: "This request conflicts with an earlier submission. Refresh before retrying.",
    PERSISTENCE_FAILURE: "The remote service could not save the Project. Refresh before retrying.",
  };
  return messages[code] ?? "The remote Project command was rejected.";
}

function customerLinkFailureMessage(code: string) {
  const messages: Record<string, string> = {
    UNAUTHENTICATED: "Your session has expired. Sign in and try again.",
    FORBIDDEN: "You do not have permission to update Projects.",
    VALIDATION_REJECTED: "The Project customer link is incomplete or invalid.",
    NOT_FOUND: "The Project is unavailable. Refresh and try again.",
    CUSTOMER_INVALID: "The selected Customer is unavailable for this Project.",
    CUSTOMER_RELINK_NOT_ALLOWED: "This Project is already linked to a different Customer.",
    CONFLICT: "The Project changed before the Customer link could be saved.",
    IDEMPOTENCY_MISMATCH: "This request conflicts with an earlier submission. Refresh before retrying.",
    PERSISTENCE_FAILURE: "The remote service could not save the Project Customer link. Refresh before retrying.",
  };
  return messages[code] ?? "The remote Project customer-link command was rejected.";
}

function isProjection(value: unknown): value is ProjectCreationProjection {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.companyId === "string" && typeof row.projectCode === "string" && typeof row.name === "string"
    && (row.customerId === null || typeof row.customerId === "string") && (row.location === null || typeof row.location === "string")
    && row.active === true && row.deletedAt === null && typeof row.createdAt === "string" && typeof row.updatedAt === "string" && typeof row.rowVersion === "number";
}

function isCustomerLinkProjection(value: unknown): value is ProjectCustomerLinkProjection {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.companyId === "string" && typeof row.customerId === "string" && typeof row.rowVersion === "number";
}
