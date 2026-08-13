import type {
  CustomerReviewBatchGenerationRepository,
  GenerateCustomerReviewBatchInput,
  GenerateCustomerReviewBatchResult,
} from "./groupedReviewContracts";

/** Provider-neutral orchestration; tenant, grouping, line, request, and evidence authority remain server-derived. */
export class CustomerReviewBatchGenerationService {
  constructor(private readonly repository: CustomerReviewBatchGenerationRepository) {}

  generate(input: GenerateCustomerReviewBatchInput): Promise<GenerateCustomerReviewBatchResult> {
    return this.repository.generate(input);
  }
}
