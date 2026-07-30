import { createClient } from "@supabase/supabase-js";
import type {
  PublicCustomerReviewRepository,
  PublicDeurReviewSnapshot,
  PublicReviewFailureCode,
  PublicReviewResult,
} from "@/features/rental/customer-review/publicReviewContracts";

interface PublicReviewRpcClient {
  schema(name: string): {
    rpc(functionName: string, parameters: { command: Record<string, unknown> }): PromiseLike<{
      data: unknown;
      error: { message?: string } | null;
    }>;
  };
}

type RpcResponse<T> =
  | { success: true; disposition: "AVAILABLE" | "ACCEPTED" | "REPLAYED" | "ALREADY_COMPLETED"; value: T }
  | { success: false; code: PublicReviewFailureCode };

const failures = new Set<PublicReviewFailureCode>([
  "INVALID_OR_UNAVAILABLE",
  "EXPIRED",
  "SUPERSEDED",
  "ALREADY_COMPLETED",
  "IDEMPOTENCY_MISMATCH",
  "VALIDATION_REJECTED",
]);

function normalize<T>(data: unknown, transportFailed: boolean): PublicReviewResult<T> {
  if (transportFailed || !data || typeof data !== "object") {
    return { success: false, code: "TRANSPORT_FAILURE" };
  }
  const response = data as Partial<RpcResponse<T>>;
  if (response.success === true && response.value && response.disposition) {
    return response as PublicReviewResult<T>;
  }
  if (response.success === false && response.code && failures.has(response.code)) {
    return { success: false, code: response.code };
  }
  return { success: false, code: "TRANSPORT_FAILURE" };
}

export class SupabasePublicCustomerReviewRepository implements PublicCustomerReviewRepository {
  constructor(private readonly client: PublicReviewRpcClient) {}

  private async call<T>(functionName: string, command: Record<string, unknown>) {
    const { data, error } = await this.client.schema("erp").rpc(functionName, { command });
    return normalize<T>(data, Boolean(error));
  }

  getSnapshot(credential: string) {
    return this.call<PublicDeurReviewSnapshot>("get_public_customer_review", { token: credential });
  }

  acknowledge(credential: string, command: { commandId: string; idempotencyKey: string }) {
    return this.call<{ reviewStatus: "Acknowledged" }>("public_acknowledge_customer_review", {
      token: credential,
      ...command,
    });
  }

  requestCorrection(
    credential: string,
    command: { commandId: string; idempotencyKey: string; reason: string },
  ) {
    return this.call<{ reviewStatus: "CorrectionRequested" }>("public_request_customer_correction", {
      token: credential,
      ...command,
      reason: command.reason.trim(),
    });
  }
}

export function createSupabasePublicCustomerReviewRepository(configuration: {
  url: string;
  publishableKey: string;
}): PublicCustomerReviewRepository {
  const client = createClient(configuration.url, configuration.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return new SupabasePublicCustomerReviewRepository(client);
}
