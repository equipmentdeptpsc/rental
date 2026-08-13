import { createClient } from "@supabase/supabase-js";
import type {
  ManagerDeurReviewSnapshot,
  ManagerReviewCommand,
  ManagerReviewDecision,
  ManagerReviewFailureCode,
  ManagerReviewReasonCommand,
  ManagerReviewRepository,
  ManagerReviewResult,
} from "@/features/rental/manager-review/managerReviewContracts";

interface RpcClient {
  schema(name: string): {
    rpc(functionName: string, parameters: { command: Record<string, unknown> }): PromiseLike<{
      data: unknown;
      error: { message?: string } | null;
    }>;
  };
}

const failures = new Set<ManagerReviewFailureCode>([
  "INVALID_OR_UNAVAILABLE", "EXPIRED", "SUPERSEDED", "ALREADY_COMPLETED",
  "IDEMPOTENCY_MISMATCH", "VALIDATION_REJECTED",
]);

function normalize<T>(data: unknown, transportFailed: boolean): ManagerReviewResult<T> {
  if (transportFailed || !data || typeof data !== "object") return { success: false, code: "TRANSPORT_FAILURE" };
  const response = data as { success?: boolean; disposition?: string; value?: T; code?: ManagerReviewFailureCode };
  if (response.success === true && response.value && response.disposition) return response as ManagerReviewResult<T>;
  if (response.success === false && response.code && failures.has(response.code)) {
    return { success: false, code: response.code };
  }
  return { success: false, code: "TRANSPORT_FAILURE" };
}

export class SupabaseManagerReviewRepository implements ManagerReviewRepository {
  constructor(private readonly client: RpcClient) {}

  private async call<T>(functionName: string, command: Record<string, unknown>) {
    const { data, error } = await this.client.schema("erp").rpc(functionName, { command });
    return normalize<T>(data, Boolean(error));
  }

  getSnapshot(credential: string) {
    return this.call<ManagerDeurReviewSnapshot>("get_manager_review", { token: credential });
  }

  approve(credential: string, command: ManagerReviewCommand) {
    return this.call<ManagerReviewDecision>("approve_manager_review", { token: credential, ...command });
  }

  reject(credential: string, command: ManagerReviewReasonCommand) {
    return this.call<ManagerReviewDecision>("reject_manager_review", {
      token: credential, ...command, reason: command.reason.trim(),
    });
  }

  requestCorrection(credential: string, command: ManagerReviewReasonCommand) {
    return this.call<ManagerReviewDecision>("request_manager_correction", {
      token: credential, ...command, reason: command.reason.trim(),
    });
  }
}

export function createSupabaseManagerReviewRepository(configuration: {
  url: string;
  publishableKey: string;
}): ManagerReviewRepository {
  return new SupabaseManagerReviewRepository(createClient(configuration.url, configuration.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storageKey: "equipment-rental.manager-public-review.auth",
    },
  }));
}
