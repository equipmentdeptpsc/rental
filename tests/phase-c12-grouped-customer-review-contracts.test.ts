import { describe, expectTypeOf, it } from "vitest";
import type {
  CustomerReviewBatch, CustomerReviewBatchItem, CustomerReviewBatchItemState,
  CustomerReviewBatchKey, CustomerReviewBatchRepository, CustomerReviewBatchStatus,
} from "@/features/rental/customer-review/groupedReviewContracts";

describe("grouped Customer Review provider-neutral contracts", () => {
  it("keeps the exact Rental-bearing group key", () => {
    expectTypeOf<CustomerReviewBatchKey>().toEqualTypeOf<{
      companyId: string; customerId: string; projectId: string; rentalId: string; reviewDate: string;
    }>();
  });

  it("defines projected item and batch states without new DEUR persistence states", () => {
    expectTypeOf<CustomerReviewBatchItemState>().toEqualTypeOf<
      "IN_PROGRESS" | "SUBMITTED_AWAITING_ACKNOWLEDGEMENT" | "ACKNOWLEDGED" |
      "CORRECTION_REQUESTED" | "CORRECTED_REVISION_PENDING"
    >();
    expectTypeOf<CustomerReviewBatchStatus>().toEqualTypeOf<
      "OPEN" | "PARTIALLY_REVIEWED" | "COMPLETED" | "EXPIRED" | "SUPERSEDED"
    >();
  });

  it("keeps optional DEUR/request identity and a read-only repository boundary", () => {
    expectTypeOf<CustomerReviewBatchItem["deurId"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<CustomerReviewBatchItem["customerReviewRequestId"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<CustomerReviewBatch["summarySnapshot"]>().toEqualTypeOf<Readonly<Record<string, unknown>>>();
    expectTypeOf<CustomerReviewBatchRepository["listItems"]>().returns.toEqualTypeOf<Promise<readonly CustomerReviewBatchItem[]>>();
  });
});
