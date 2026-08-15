import type {
  AssignmentCommandRepository,
  AssignmentCreationProjection,
  CreateAssignmentCommand,
} from "@/features/assignment/commands/contracts";
import {
  isOperationalCommandResult,
  type OperationalCommandResult,
} from "@/features/rental/operations/commands/contracts";

interface AssignmentRpcClient {
  schema(name: string): {
    rpc(name: string, args: Record<string, unknown>): PromiseLike<{
      data: unknown;
      error: { message: string } | null;
    }>;
  };
}

export class SupabaseAssignmentCommandRepository implements AssignmentCommandRepository {
  constructor(private readonly client: AssignmentRpcClient) {}

  async createAssignment(command: CreateAssignmentCommand): Promise<OperationalCommandResult<AssignmentCreationProjection>> {
    const { data, error } = await this.client.schema("erp").rpc("command_create_assignment", { command });
    if (error) {
      return {
        success: false,
        code: "TRANSPORT_FAILURE",
        message: "Confirmation was not received from the remote service. Refresh before retrying.",
        retryable: true,
        refreshRequired: true,
      };
    }
    if (!isOperationalCommandResult<AssignmentCreationProjection>(data) || (data.success && !isProjection(data.value))) {
      return {
        success: false,
        code: "VALIDATION_REJECTED",
        message: "The remote Assignment command returned an invalid response.",
        retryable: false,
        refreshRequired: true,
      };
    }
    return data;
  }
}

function isProjection(value: unknown): value is AssignmentCreationProjection {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string"
    && typeof row.companyId === "string"
    && typeof row.equipmentId === "string"
    && typeof row.operatorId === "string"
    && typeof row.projectId === "string"
    && typeof row.assignedDate === "string"
    && typeof row.expectedReturn === "string"
    && typeof row.remarks === "string"
    && row.status === "Active"
    && typeof row.createdAt === "string"
    && typeof row.updatedAt === "string"
    && typeof row.rowVersion === "number";
}
