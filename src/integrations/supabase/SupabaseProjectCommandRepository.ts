import type { CreateProjectCommand, ProjectCommandRepository, ProjectCreationProjection } from "@/features/project/commands/contracts";
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

function isProjection(value: unknown): value is ProjectCreationProjection {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.companyId === "string" && typeof row.projectCode === "string" && typeof row.name === "string"
    && (row.customerId === null || typeof row.customerId === "string") && (row.location === null || typeof row.location === "string")
    && row.active === true && row.deletedAt === null && typeof row.createdAt === "string" && typeof row.updatedAt === "string" && typeof row.rowVersion === "number";
}
