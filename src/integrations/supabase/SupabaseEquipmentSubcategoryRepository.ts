import type { SupabaseClient } from "@supabase/supabase-js";
import { repositoryFailure, repositorySuccess, type RepositoryResult } from "@/core/persistence";
import type { EquipmentSubcategoryCommandRepository, EquipmentSubcategoryReadRepository, CanonicalEquipmentSubcategory } from "@/features/masters/equipment-subcategory/canonical";

type RpcClient = Pick<SupabaseClient, "schema">;
const map = (row: Record<string, unknown>): CanonicalEquipmentSubcategory => ({ id: String(row.id), categoryId: String(row.category_id), name: String(row.name), code: typeof row.code === "string" ? row.code : undefined, active: Boolean(row.active), usageCount: Number(row.usage_count ?? 0), updatedAt: String(row.updated_at ?? ""), rowVersion: Number(row.row_version ?? 0) });
const failure = (message: string): RepositoryResult<never> => repositoryFailure("REMOTE_READ_FAILED", message, { context: { repository: "EquipmentSubcategory" }, recoverability: "RETRYABLE", recommendedAction: "Retry the request." });

export class SupabaseEquipmentSubcategoryRepository implements EquipmentSubcategoryReadRepository, EquipmentSubcategoryCommandRepository {
  constructor(private readonly client: RpcClient) {}
  async list(): Promise<RepositoryResult<{ items: CanonicalEquipmentSubcategory[] }>> { const { data, error } = await this.client.schema("erp").rpc("list_equipment_subcategories", { target_category_id: null, include_inactive: true }); return error || !Array.isArray(data) ? failure("Equipment sub-categories could not be loaded.") : repositorySuccess({ items: data.map((row) => map(row as Record<string, unknown>)) }); }
  async search(query: string) { const result = await this.list(); if (!result.success) return result; const term = query.trim().toLowerCase(); return repositorySuccess({ items: result.value.items.filter((item) => !term || `${item.name} ${item.code ?? ""}`.toLowerCase().includes(term)) }); }
  async getById(id: string) { const result = await this.list(); if (!result.success) return result; return repositorySuccess(result.value.items.find((item) => item.id === id) ?? null); }
  async listAssignable(categoryId: string): Promise<RepositoryResult<CanonicalEquipmentSubcategory[]>> { const { data, error } = await this.client.schema("erp").rpc("list_assignable_equipment_subcategories", { target_category_id: categoryId }); return error || !Array.isArray(data) ? failure("Assignable Equipment sub-categories could not be loaded.") : repositorySuccess(data.map((row) => map(row as Record<string, unknown>))); }
  private async command(name: string, command: Record<string, unknown>) { const { data, error } = await this.client.schema("erp").rpc(name, { command }); if (error) return { success: false, code: "TRANSPORT_FAILURE" }; const value = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {}; return value.success === false ? { success: false, code: String(value.code ?? "PERSISTENCE_FAILURE") } : { success: true, value: value.value && typeof value.value === "object" ? map(value.value as Record<string, unknown>) : undefined }; }
  create(input: Parameters<EquipmentSubcategoryCommandRepository["create"]>[0]) { return this.command("command_create_equipment_subcategory", input); }
  update(input: Parameters<EquipmentSubcategoryCommandRepository["update"]>[0]) { return this.command("command_update_equipment_subcategory", input); }
  setActive(input: Parameters<EquipmentSubcategoryCommandRepository["setActive"]>[0], active: boolean) { return this.command(active ? "command_activate_equipment_subcategory" : "command_deactivate_equipment_subcategory", input); }
}
