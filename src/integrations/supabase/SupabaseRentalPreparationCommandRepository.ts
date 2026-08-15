import type { AggregateRentalPreparationProjection, PrepareReservedRentalAggregateCommand, PrepareReservedRentalCommand, RentalPreparationCommandRepository, RentalPreparationProjection } from "@/features/rental/operations/commands/rentalPreparationContracts";
import { isOperationalCommandResult, type OperationalCommandResult } from "@/features/rental/operations/commands/contracts";

interface RpcClient { schema(name: string): { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> } }

export class SupabaseRentalPreparationCommandRepository implements RentalPreparationCommandRepository {
  constructor(private readonly client: RpcClient) {}
  async prepareReservedRental(command: PrepareReservedRentalCommand): Promise<OperationalCommandResult<RentalPreparationProjection>> {
    const { data, error } = await this.client.schema("erp").rpc("command_prepare_reserved_rental", { command });
    if (error) return { success: false, code: "TRANSPORT_FAILURE", message: "Confirmation was not received from the remote service. Refresh before retrying.", retryable: true, refreshRequired: true };
    if (!isOperationalCommandResult<RentalPreparationProjection>(data) || (data.success && !isProjection(data.value))) return { success: false, code: "VALIDATION_REJECTED", message: "The remote Rental preparation command returned an invalid response.", retryable: false, refreshRequired: true };
    return data;
  }
  async prepareReservedRentalAggregate(command: PrepareReservedRentalAggregateCommand): Promise<OperationalCommandResult<AggregateRentalPreparationProjection>> {
    const { data, error } = await this.client.schema("erp").rpc("command_prepare_reserved_rental_aggregate", { command });
    if (error) return transportFailure();
    if (!isOperationalCommandResult<AggregateRentalPreparationProjection>(data) || (data.success && !isAggregateProjection(data.value))) return invalidResponse();
    return data;
  }
}

const transportFailure = (): OperationalCommandResult<never> => ({ success: false, code: "TRANSPORT_FAILURE", message: "Confirmation was not received from the remote service. Refresh before retrying.", retryable: true, refreshRequired: true });
const invalidResponse = (): OperationalCommandResult<never> => ({ success: false, code: "VALIDATION_REJECTED", message: "The remote Rental preparation command returned an invalid response.", retryable: false, refreshRequired: true });

function isProjection(value: unknown): value is RentalPreparationProjection {
  if (!value || typeof value !== "object") return false;
  const row=value as Record<string,unknown>;
  return typeof row.rentalId==="string" && typeof row.lineId==="string" && row.status==="Reserved" && typeof row.version==="number" && row.releaseReady===true;
}

function isAggregateProjection(value: unknown): value is AggregateRentalPreparationProjection {
  if (!value || typeof value !== "object") return false;
  const row=value as Record<string,unknown>;
  return typeof row.rentalId==="string" && typeof row.companyId==="string" && row.status==="Reserved" &&
    typeof row.version==="number" && typeof row.preparedLineCount==="number" && row.releaseReady===true &&
    Array.isArray(row.lines) && row.lines.length===row.preparedLineCount && row.lines.every(line=>{
      if (!line || typeof line!=="object") return false;
      const item=line as Record<string,unknown>;
      return ["lineId","assignmentId","equipmentId","operatorId","sourceFingerprint"].every(key=>typeof item[key]==="string") && typeof item.version==="number";
    });
}
