import type {
  CustomerReviewBatchGenerationRepository,
  GenerateCustomerReviewBatchInput,
  GenerateCustomerReviewBatchResult,
} from "@/features/rental/customer-review/groupedReviewContracts";

interface RpcClient {
  schema(name: string): { rpc(name: string, args: { command: GenerateCustomerReviewBatchInput }): PromiseLike<{ data: unknown; error: unknown }> };
}

const knownFailures = new Set([
  "UNAUTHENTICATED", "FORBIDDEN", "VALIDATION_REJECTED", "NOT_FOUND", "INVALID_TIMEZONE",
  "INVALID_BUSINESS_DATE", "INVALID_TRANSITION", "IDEMPOTENCY_MISMATCH",
]);

export class SupabaseCustomerReviewBatchGenerationRepository implements CustomerReviewBatchGenerationRepository {
  constructor(private readonly client: RpcClient) {}

  async generate(input: GenerateCustomerReviewBatchInput): Promise<GenerateCustomerReviewBatchResult> {
    const { data, error } = await this.client.schema("erp").rpc("command_generate_customer_review_batch", { command: input });
    if (error || !data || typeof data !== "object") return { success: false, code: "TRANSPORT_FAILURE" };
    const result = data as GenerateCustomerReviewBatchResult;
    if (result.success || knownFailures.has(result.code)) return result;
    return { success: false, code: "TRANSPORT_FAILURE" };
  }
}
