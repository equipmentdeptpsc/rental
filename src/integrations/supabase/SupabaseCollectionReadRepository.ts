import type { SupabaseClient } from "@supabase/supabase-js";
import { repositoryFailure, repositorySuccess, type Page, type RepositoryResult } from "@/core/persistence";
import { createRemoteCapabilities, type ReadOnlyRepository, type RemoteSearchOptions } from "@/core/remote";
import type { CollectionTransaction } from "@/features/rental/collections/types";
import { mapCanonicalRow } from "./SupabaseReadRepository";

type RpcClient = Pick<SupabaseClient, "schema">;

export class SupabaseCollectionReadRepository implements ReadOnlyRepository<CollectionTransaction> {
  readonly capabilities = createRemoteCapabilities("ReadOnly", "SupportsFiltering", "SupportsOrdering");
  constructor(private readonly client: RpcClient) {}

  async list(options: RemoteSearchOptions = {}): Promise<RepositoryResult<Page<CollectionTransaction>>> {
    const rentalId = options.filters?.rental_id;
    if (typeof rentalId !== "string" || !rentalId) return missingRentalFilter();
    const { data, error } = await this.client.schema("erp").rpc("read_collections_for_rental", { target_rental_id: rentalId });
    if (error || !Array.isArray(data)) return remoteFailure();
    const items: CollectionTransaction[] = [];
    for (const row of data) { const mapped = mapCollection(row as Record<string, unknown>); if (!mapped.success) return mapped; items.push(mapped.value); }
    return repositorySuccess({ items });
  }

  async search(query: string, options: RemoteSearchOptions = {}) {
    const result = await this.list(options); if (!result.success) return result;
    const term = query.trim().toLowerCase();
    return repositorySuccess({ items: result.value.items.filter(item => !term || item.referenceNumber.toLowerCase().includes(term)) });
  }

  async getById(_id: string): Promise<RepositoryResult<CollectionTransaction | null>> { return missingRentalFilter(); }
}

function mapCollection(row: Record<string, unknown>): RepositoryResult<CollectionTransaction> {
  const base = mapCanonicalRow<Record<string, unknown>>(row); if (!base.success) return base;
  const value = base.value;
  if (typeof value.id !== "string" || typeof value.billingStatementId !== "string" || typeof value.rentalId !== "string" || typeof value.amount !== "number" || typeof value.collectedAt !== "string") return repositoryFailure("REMOTE_ROW_MALFORMED", "Remote Collection requires canonical identity, amount, rental, and date fields.", { context: { repository: "Collection" }, recoverability: "MANUAL_RECONCILIATION", recommendedAction: "Repair the canonical Collection row." });
  return repositorySuccess({ id: value.id, statementId: value.billingStatementId, rentalId: value.rentalId, amount: value.amount, paymentDate: value.collectedAt.slice(0, 10), referenceNumber: typeof value.referenceNo === "string" ? value.referenceNo : "", recordedBy: typeof value.createdBy === "string" ? value.createdBy : "Unknown", recordedByUserId: typeof value.createdBy === "string" ? value.createdBy : undefined, recordedAt: typeof value.createdAt === "string" ? value.createdAt : value.collectedAt });
}
function missingRentalFilter<T>(): RepositoryResult<T> { return repositoryFailure("REPOSITORY_QUERY_FAILED", "Collection reads require a Rental scope.", { context: { repository: "Collection" }, recoverability: "USER_ACTION_REQUIRED", recommendedAction: "Open the Collection through its Rental workspace." }); }
function remoteFailure<T>(): RepositoryResult<T> { return repositoryFailure("REMOTE_READ_FAILED", "Collections could not be loaded.", { context: { repository: "Collection" }, recoverability: "RETRYABLE", recommendedAction: "Retry the request." }); }
