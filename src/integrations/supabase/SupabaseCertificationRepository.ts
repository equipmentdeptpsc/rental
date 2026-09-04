import type { SupabaseClient } from "@supabase/supabase-js";
import type { ReadOnlyRepository } from "@/core/remote";
import type { RepositoryResult, Page } from "@/core/persistence";
import { repositoryFailure, repositorySuccess } from "@/core/persistence";
import type { CertificationTypeCommandRepository, CertificationTypeRecord } from "@/features/masters/certification-type/types";

type RpcClient = Pick<SupabaseClient, "schema">;
const map = (row: Record<string, unknown>): CertificationTypeRecord => ({ id: String(row.id), name: String(row.name), active: Boolean(row.active), usageCount: Number(row.usage_count ?? 0), createdAt: String(row.created_at), updatedAt: String(row.updated_at), rowVersion: Number(row.row_version) });
export class SupabaseCertificationReadRepository implements ReadOnlyRepository<CertificationTypeRecord> {
  constructor(private readonly client: RpcClient) {}
  async list(): Promise<RepositoryResult<Page<CertificationTypeRecord>>> {
    const { data, error } = await this.client.schema("erp").rpc("list_certification_types", { include_inactive: true });
    if (error || !Array.isArray(data)) return repositoryFailure("REMOTE_READ_FAILED", "Certification types could not be loaded.", { context: { repository: "CertificationType" }, recoverability: "RETRYABLE", recommendedAction: "Retry the request." });
    return repositorySuccess({ items: data.map((row) => map(row as Record<string, unknown>)) });
  }
  async search(query: string): Promise<RepositoryResult<Page<CertificationTypeRecord>>> { const result = await this.list(); if (!result.success) return result; const q = query.trim().toLowerCase(); return repositorySuccess({ items: result.value.items.filter((item) => !q || item.name.toLowerCase().includes(q)) }); }
  async getById(id: string): Promise<RepositoryResult<CertificationTypeRecord | null>> { const result = await this.list(); if (!result.success) return result; return repositorySuccess(result.value.items.find((item) => item.id === id) ?? null); }
}
export class SupabaseCertificationCommandRepository implements CertificationTypeCommandRepository {
  constructor(private readonly client: RpcClient) {}
  private async call(name: string, command: Record<string, unknown>) { const { data, error } = await this.client.schema("erp").rpc(name, { command }); if (error) return { success: false, code: "TRANSPORT_FAILURE" }; const value = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {}; if (value.success === false) return { success: false, code: String(value.code ?? "PERSISTENCE_FAILURE") }; return { success: true, value: value.value as CertificationTypeRecord | undefined }; }
  create(input: Parameters<CertificationTypeCommandRepository["create"]>[0]) { return this.call("command_create_certification_type", input); }
  update(input: Parameters<CertificationTypeCommandRepository["update"]>[0]) { return this.call("command_update_certification_type", input); }
  setActive(input: Parameters<CertificationTypeCommandRepository["setActive"]>[0], active: boolean) { return this.call(active ? "command_activate_certification_type" : "command_deactivate_certification_type", input); }
}
