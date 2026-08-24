import type { CreateCustomerCommand, CustomerCommandRepository, CustomerCreationProjection } from "@/features/customer/commands/contracts";
import { isOperationalCommandResult, type OperationalCommandResult } from "@/features/rental/operations/commands/contracts";

interface CustomerRpcClient { schema(name: string): { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> } }

export class SupabaseCustomerCommandRepository implements CustomerCommandRepository {
  constructor(private readonly client: CustomerRpcClient) {}
  async createCustomer(command: CreateCustomerCommand): Promise<OperationalCommandResult<CustomerCreationProjection>> {
    const { data, error } = await this.client.schema("erp").rpc("command_create_customer", { command });
    if (error) return { success: false, code: "TRANSPORT_FAILURE", message: "Confirmation was not received from the remote service. Refresh before retrying.", retryable: true, refreshRequired: true };
    const candidate = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : undefined;
    if (candidate?.success === false && typeof candidate.code === "string") return { success: false, code: candidate.code as Extract<OperationalCommandResult<CustomerCreationProjection>, { success: false }>["code"], message: failureMessage(candidate.code), retryable: false, refreshRequired: ["CUSTOMER_CODE_CONFLICT", "CUSTOMER_ID_CONFLICT", "PERSISTENCE_FAILURE"].includes(candidate.code) };
    if (!isOperationalCommandResult<CustomerCreationProjection>(data) || (data.success && !isProjection(data.value))) return { success: false, code: "VALIDATION_REJECTED", message: "The remote Customer command returned an invalid response.", retryable: false, refreshRequired: true };
    return data;
  }
}

function failureMessage(code: string) {
  const messages: Record<string, string> = {
    UNAUTHENTICATED: "Your session has expired. Sign in and try again.", FORBIDDEN: "You do not have permission to create Customers.",
    VALIDATION_REJECTED: "Enter a valid Customer Code, Customer Name, and optional contact values.", CUSTOMER_CODE_CONFLICT: "Customer code already exists.",
    CUSTOMER_ID_CONFLICT: "The Customer identity is already in use.", IDEMPOTENCY_MISMATCH: "This request conflicts with an earlier submission. Refresh before retrying.",
    PERSISTENCE_FAILURE: "The remote service could not save the Customer. Refresh before retrying.",
  };
  return messages[code] ?? "The remote Customer command was rejected.";
}

function isProjection(value: unknown): value is CustomerCreationProjection {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const nullable = (item: unknown) => item === null || typeof item === "string";
  return typeof row.id === "string" && typeof row.companyId === "string" && typeof row.customerCode === "string" && typeof row.name === "string"
    && nullable(row.email) && nullable(row.phone) && nullable(row.address) && row.active === true && row.deletedAt === null
    && typeof row.createdAt === "string" && typeof row.updatedAt === "string" && typeof row.rowVersion === "number";
}
