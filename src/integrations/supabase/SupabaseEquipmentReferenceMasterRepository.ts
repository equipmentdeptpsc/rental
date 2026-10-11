import type { EquipmentReferenceKind, EquipmentReferenceMasterRepository, EquipmentReferenceRecord, EquipmentReferenceResult } from "@/features/masters/equipment-reference/contracts";

interface RpcClient { schema(name: string): { rpc(name: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> }; }
const failure = <T>(code: string, message: string): EquipmentReferenceResult<T> => ({ success: false, code, message });
const validRecord = (value: unknown): value is EquipmentReferenceRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === "string" && typeof row.name === "string" && typeof row.active === "boolean"
    && typeof row.rowVersion === "number" && (row.code === null || typeof row.code === "string")
    && (row.description === null || typeof row.description === "string");
};
const messageFor = (code: string) => ({
  UNAUTHENTICATED: "Your session has expired. Sign in and retry.", FORBIDDEN: "You do not have permission to maintain this master data.",
  VALIDATION_REJECTED: "Enter a valid name and code.", NOT_FOUND: "This record is no longer available. Refresh the list.",
  CONFLICT: "This record changed since you opened it. Refresh and retry.", REFERENCE_CONFLICT: "A record with this name or code already exists.",
  IDEMPOTENCY_MISMATCH: "This request conflicts with an earlier submission. Refresh and retry.",
} as Record<string, string>)[code] ?? "The reference-data command could not be completed.";

export class SupabaseEquipmentReferenceMasterRepository implements EquipmentReferenceMasterRepository {
  constructor(private readonly client: RpcClient) {}
  async list(kind: EquipmentReferenceKind): Promise<EquipmentReferenceResult<EquipmentReferenceRecord[]>> {
    const { data, error } = await this.client.schema("erp").rpc("read_equipment_reference_master", { kind });
    if (error) return failure("TRANSPORT_FAILURE", "Equipment reference data could not be loaded.");
    const result = data as { success?: unknown; items?: unknown; code?: unknown } | null;
    if (result?.success === false) return failure(String(result.code), messageFor(String(result.code)));
    if (result?.success !== true || !Array.isArray(result.items) || !result.items.every(validRecord)) return failure("INVALID_RESPONSE", "Equipment reference data returned an invalid response.");
    return { success: true, value: result.items };
  }
  async save(command: Parameters<EquipmentReferenceMasterRepository["save"]>[0]): Promise<EquipmentReferenceResult<EquipmentReferenceRecord>> {
    const { data, error } = await this.client.schema("erp").rpc("command_save_equipment_reference_master", { command });
    if (error) return failure("TRANSPORT_FAILURE", "Confirmation was not received. Refresh before retrying.");
    const result = data as { success?: unknown; value?: unknown; code?: unknown } | null;
    if (result?.success === false) return failure(String(result.code), messageFor(String(result.code)));
    if (result?.success !== true || !validRecord(result.value)) return failure("INVALID_RESPONSE", "Equipment reference-data command returned an invalid response.");
    return { success: true, value: result.value };
  }
}
