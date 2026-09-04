import type { SupabaseClient } from "@supabase/supabase-js";
import { repositoryFailure, repositorySuccess, type RepositoryResult } from "@/core/persistence";
import type { CertificationTypeRecord } from "@/features/masters/certification-type/types";

export interface OperatorCertificationAssignment {
  operatorId: string;
  certificationTypeId: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  rowVersion: number;
}

export interface OperatorCertificationRepository {
  listAssignableTypes(): Promise<RepositoryResult<CertificationTypeRecord[]>>;
  listForOperator(operatorId: string): Promise<RepositoryResult<OperatorCertificationAssignment[]>>;
  assign(input: { commandId: string; idempotencyKey: string; operatorId: string; certificationTypeId: string }): Promise<{ success: boolean; code?: string }>;
  remove(input: { commandId: string; idempotencyKey: string; operatorId: string; certificationTypeId: string }): Promise<{ success: boolean; code?: string }>;
}

type RpcClient = Pick<SupabaseClient, "schema">;

const error = (message: string) => repositoryFailure("REMOTE_READ_FAILED", message, { context: { repository: "OperatorCertification" }, recoverability: "RETRYABLE", recommendedAction: "Retry the request." });

export class SupabaseOperatorCertificationRepository implements OperatorCertificationRepository {
  constructor(private readonly client: RpcClient) {}
  async listAssignableTypes() {
    const { data, error: rpcError } = await this.client.schema("erp").rpc("list_assignable_certification_types");
    if (rpcError || !Array.isArray(data)) return error("Assignable certification types could not be loaded.");
    return repositorySuccess(data.map((row) => { const value = row as Record<string, unknown>; return { id: String(value.id), name: String(value.name), active: Boolean(value.active), usageCount: 0, createdAt: "", updatedAt: "", rowVersion: Number(value.row_version ?? 0) }; }));
  }
  async listForOperator(operatorId: string) {
    const { data, error: rpcError } = await this.client.schema("erp").rpc("list_operator_certifications", { target_operator_id: operatorId });
    if (rpcError || !Array.isArray(data)) return error("Operator certifications could not be loaded.");
    return repositorySuccess(data.map((row) => { const value = row as Record<string, unknown>; return { operatorId: String(value.operator_id), certificationTypeId: String(value.certification_type_id), name: String(value.name), active: Boolean(value.active), createdAt: String(value.created_at ?? ""), updatedAt: String(value.updated_at ?? ""), rowVersion: Number(value.row_version ?? 0) }; }));
  }
  private async command(name: string, input: Record<string, unknown>) {
    const { data, error: rpcError } = await this.client.schema("erp").rpc(name, { command: input });
    if (rpcError) return { success: false, code: "TRANSPORT_FAILURE" };
    const value = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
    return value.success === false ? { success: false, code: String(value.code ?? "PERSISTENCE_FAILURE") } : { success: true };
  }
  assign(input: Parameters<OperatorCertificationRepository["assign"]>[0]) { return this.command("command_assign_operator_certification", input); }
  remove(input: Parameters<OperatorCertificationRepository["remove"]>[0]) { return this.command("command_remove_operator_certification", input); }
}

export class LocalOperatorCertificationRepository implements OperatorCertificationRepository {
  async listAssignableTypes() { return repositorySuccess<CertificationTypeRecord[]>([]); }
  async listForOperator() { return repositorySuccess<OperatorCertificationAssignment[]>([]); }
  async assign() { return { success: false, code: "UNSUPPORTED" }; }
  async remove() { return { success: false, code: "UNSUPPORTED" }; }
}
