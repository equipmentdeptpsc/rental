import type { CreateOperatorCommand, OperatorCommandRepository, OperatorCreationProjection } from "@/features/operators/commands/contracts";
import { isOperationalCommandResult, type OperationalCommandResult } from "@/features/rental/operations/commands/contracts";

interface OperatorRpcClient {
  schema(name: string): { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };
}

export class SupabaseOperatorCommandRepository implements OperatorCommandRepository {
  constructor(private readonly client: OperatorRpcClient) {}

  async createOperator(command: CreateOperatorCommand): Promise<OperationalCommandResult<OperatorCreationProjection>> {
    const { data, error } = await this.client.schema("erp").rpc("command_create_operator", { command });
    if (error) return { success: false, code: "TRANSPORT_FAILURE", message: "Confirmation was not received from the remote service. Refresh before retrying.", retryable: true, refreshRequired: true };
    const candidate = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : undefined;
    if (candidate?.success === false && typeof candidate.code === "string") return { success: false, code: candidate.code as Extract<OperationalCommandResult<OperatorCreationProjection>, { success: false }>["code"], message: failureMessage(candidate.code), retryable: false, refreshRequired: ["OPERATOR_ID_CONFLICT", "PERSISTENCE_FAILURE"].includes(candidate.code) };
    if (!isOperationalCommandResult<OperatorCreationProjection>(data) || (data.success && !isProjection(data.value))) return { success: false, code: "VALIDATION_REJECTED", message: "The remote Operator command returned an invalid response.", retryable: false, refreshRequired: true };
    return data;
  }
}

function failureMessage(code: string) {
  const messages: Record<string, string> = {
    UNAUTHENTICATED: "Your session has expired. Sign in and try again.",
    FORBIDDEN: "You do not have permission to create Operators.",
    VALIDATION_REJECTED: "Enter valid Operator details.",
    OPERATOR_ID_CONFLICT: "The Operator identity is already in use. Refresh before retrying.",
    IDEMPOTENCY_MISMATCH: "This request conflicts with an earlier submission. Refresh before retrying.",
    PERSISTENCE_FAILURE: "The remote service could not save the Operator. Refresh before retrying.",
  };
  return messages[code] ?? "The remote Operator command was rejected.";
}

function isProjection(value: unknown): value is OperatorCreationProjection {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.companyId === "string" && typeof row.name === "string"
    && (row.email === null || typeof row.email === "string") && (row.licenseNumber === null || typeof row.licenseNumber === "string")
    && ["None", "Heavy Machinery", "Forklift", "Crane Logistics"].includes(String(row.certificationType))
    && row.status === "Active" && (row.joinedDate === null || typeof row.joinedDate === "string") && row.deletedAt === null
    && typeof row.createdAt === "string" && typeof row.updatedAt === "string" && typeof row.rowVersion === "number";
}
