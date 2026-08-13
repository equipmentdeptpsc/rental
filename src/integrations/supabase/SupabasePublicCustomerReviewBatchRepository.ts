import { createClient } from "@supabase/supabase-js";
import type {
  PublicCustomerReviewBatch,
  PublicCustomerReviewBatchRepository,
  PublicGroupedFailureCode,
  PublicGroupedReviewResult,
} from "@/features/rental/customer-review/publicGroupedReviewContracts";

interface GroupedReviewRpcClient {
  schema(name: string): {
    rpc(functionName: string, parameters: { command: Record<string, unknown> }): PromiseLike<{
      data: unknown;
      error: { message?: string } | null;
    }>;
  };
}

const failures = new Set<PublicGroupedFailureCode>([
  "INVALID_OR_UNAVAILABLE", "EXPIRED", "SUPERSEDED", "NOT_ACTIONABLE",
  "ALREADY_COMPLETED", "IDEMPOTENCY_MISMATCH", "VALIDATION_REJECTED",
]);

function normalize<T>(data: unknown, transportFailed: boolean): PublicGroupedReviewResult<T> {
  if (transportFailed || !data || typeof data !== "object") return { success: false, code: "TRANSPORT_FAILURE" };
  const response = data as Partial<PublicGroupedReviewResult<T>>;
  if (response.success === true && "value" in response && response.value && response.disposition) {
    return response as PublicGroupedReviewResult<T>;
  }
  if (response.success === false && response.code && failures.has(response.code)) {
    return { success: false, code: response.code };
  }
  return { success: false, code: "TRANSPORT_FAILURE" };
}

export class SupabasePublicCustomerReviewBatchRepository implements PublicCustomerReviewBatchRepository {
  constructor(private readonly client: GroupedReviewRpcClient) {}

  private async call(functionName: string, command: Record<string, unknown>) {
    const { data, error } = await this.client.schema("erp").rpc(functionName, { command });
    return normalize<PublicCustomerReviewBatch>(data, Boolean(error));
  }

  lookup(credential: string) {
    return this.call("get_customer_review_batch", { credential });
  }

  acknowledgeItem(credential: string, publicItemId: string, command: { commandId: string; idempotencyKey: string }) {
    return this.call("acknowledge_customer_review_batch_item", { credential, publicItemId, ...command });
  }

  requestCorrection(
    credential: string,
    publicItemId: string,
    remarks: string,
    command: { commandId: string; idempotencyKey: string },
  ) {
    return this.call("request_customer_review_batch_item_correction", {
      credential, publicItemId, remarks: remarks.trim(), ...command,
    });
  }
}

export function createSupabasePublicCustomerReviewBatchRepository(configuration: {
  url: string;
  publishableKey: string;
}): PublicCustomerReviewBatchRepository {
  const client = createClient(configuration.url, configuration.publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return new SupabasePublicCustomerReviewBatchRepository(client);
}
