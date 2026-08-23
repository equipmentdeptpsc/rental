import type { CreateEquipmentCommand, EquipmentCommandRepository, EquipmentCreationProjection, EquipmentReferenceDataResult } from "@/features/equipment/commands/contracts";
import { isOperationalCommandResult, type OperationalCommandResult } from "@/features/rental/operations/commands/contracts";

interface RpcClient { schema(name: string): { rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> }; }

export class SupabaseEquipmentCommandRepository implements EquipmentCommandRepository {
  constructor(private readonly client: RpcClient) {}
  async readReferenceData(): Promise<EquipmentReferenceDataResult> {
    const { data, error } = await this.client.schema("erp").rpc("read_canonical_equipment_reference_data");
    if (error) return { success: false, code: "TRANSPORT_FAILURE", message: "Equipment reference data could not be loaded.", retryable: true };
    if (!isReferenceData(data)) return { success: false, code: "INVALID_RESPONSE", message: "The remote Equipment reference response was invalid.", retryable: false };
    return data;
  }
  async createEquipment(command: CreateEquipmentCommand): Promise<OperationalCommandResult<EquipmentCreationProjection>> {
    const { data, error } = await this.client.schema("erp").rpc("command_create_equipment", { command });
    if (error) return failure("TRANSPORT_FAILURE", "Confirmation was not received from the remote service. Refresh before retrying.", true);
    const candidate = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : undefined;
    if (candidate?.success === false && typeof candidate.code === "string") return failure(candidate.code as Extract<OperationalCommandResult<never>, { success: false }>["code"], message(candidate.code), ["ASSET_NUMBER_CONFLICT", "EQUIPMENT_ID_CONFLICT", "PERSISTENCE_FAILURE"].includes(candidate.code));
    if (!isOperationalCommandResult<EquipmentCreationProjection>(data) || (data.success && !isProjection(data.value))) return failure("VALIDATION_REJECTED", "The remote Equipment command returned an invalid response.", true);
    return data;
  }
}

function failure(code: Extract<OperationalCommandResult<never>, { success: false }>["code"], messageText: string, refreshRequired: boolean): OperationalCommandResult<never> { return { success: false, code, message: messageText, retryable: code === "TRANSPORT_FAILURE", refreshRequired }; }
function message(code: string) { return ({ UNAUTHENTICATED: "Your session has expired. Sign in and try again.", FORBIDDEN: "You do not have permission to create Equipment.", VALIDATION_REJECTED: "Enter valid Equipment details.", NOT_FOUND: "The selected Cost Code is unavailable.", ASSET_NUMBER_CONFLICT: "Asset number already exists.", EQUIPMENT_ID_CONFLICT: "The Equipment identity is already in use.", IDEMPOTENCY_MISMATCH: "This request conflicts with an earlier submission. Refresh before retrying.", PERSISTENCE_FAILURE: "The remote service could not save the Equipment. Refresh before retrying." } as Record<string, string>)[code] ?? "The remote Equipment command was rejected."; }
function isReferenceData(value: unknown): value is Extract<EquipmentReferenceDataResult, { success: true }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return candidate.success === true && Array.isArray(candidate.costCodes) && candidate.costCodes.every((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const row = item as Record<string, unknown>;
    return typeof row.id === "string" && typeof row.code === "string" && typeof row.name === "string" && row.active === true && typeof row.sortOrder === "number";
  });
}
function isProjection(value: unknown): value is EquipmentCreationProjection { if (!value || typeof value !== "object") return false; const row = value as Record<string, unknown>; return typeof row.id === "string" && typeof row.companyId === "string" && typeof row.assetNo === "string" && typeof row.equipmentName === "string" && typeof row.costCodeId === "string" && typeof row.statusId === "string" && typeof row.currentReading === "number" && row.active === true && row.deletedAt === null && typeof row.rowVersion === "number"; }
