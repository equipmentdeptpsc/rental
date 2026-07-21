import type { EntityIdentity, Page, PageRequest, PreparedRepositoryMutation, PreparedRepositoryTransaction, RepositoryError, RepositoryResult, StorageEnvelope, VersionMetadata } from "./contracts";

export const repositorySuccess = <T>(value: T): RepositoryResult<T> => ({ success: true, value });
export const repositoryFailure = (code: string, message: string, options: Partial<Omit<RepositoryError, "code" | "message">> = {}): RepositoryResult<never> => ({ success: false, error: { code, message, context: options.context ?? {}, recoverability: options.recoverability ?? "USER_ACTION_REQUIRED", recommendedAction: options.recommendedAction ?? "Review the repository operation and retry.", cause: options.cause } });

export function paginate<T>(records: T[], request: PageRequest): Page<T> {
  const limit = Math.max(1, Math.trunc(request.limit)); const offset = request.cursor ? Number.parseInt(request.cursor, 10) : Math.max(0, request.offset ?? 0);
  const safeOffset = Number.isFinite(offset) && offset >= 0 ? offset : 0; const items = records.slice(safeOffset, safeOffset + limit);
  return { items: structuredClone(items), total: records.length, ...(safeOffset + items.length < records.length ? { nextCursor: String(safeOffset + items.length) } : {}) };
}

export function normalizeStorageEnvelope<T>(value: unknown, schemaVersion: number): RepositoryResult<StorageEnvelope<T>> {
  if (Array.isArray(value)) return repositorySuccess({ schemaVersion, records: structuredClone(value as T[]), metadata: { sourceSchemaVersion: 0 } });
  if (!value || typeof value !== "object") return repositoryFailure("REPOSITORY_STORAGE_MALFORMED", "Repository storage is neither a legacy array nor a versioned envelope.", { recoverability: "USER_ACTION_REQUIRED", recommendedAction: "Restore a valid backup or reset only the affected repository." });
  const envelope = value as Partial<StorageEnvelope<T>>;
  if (!Number.isInteger(envelope.schemaVersion) || !Array.isArray(envelope.records)) return repositoryFailure("REPOSITORY_ENVELOPE_INVALID", "Repository envelope metadata is invalid.", { context: { schemaVersion: envelope.schemaVersion }, recommendedAction: "Run the registered repository migration before reading records." });
  return repositorySuccess(structuredClone(envelope as StorageEnvelope<T>));
}

export function checkOptimisticVersion(current: VersionMetadata | undefined, expected: VersionMetadata | undefined): RepositoryResult<void> {
  if (!expected) return repositorySuccess(undefined);
  if ((expected.version !== undefined && current?.version !== expected.version) || (expected.etag !== undefined && current?.etag !== expected.etag) || (expected.updatedAt !== undefined && current?.updatedAt !== expected.updatedAt)) return repositoryFailure("REPOSITORY_CONFLICT", "The record changed after it was loaded.", { recoverability: "RETRYABLE", recommendedAction: "Reload the latest record, reconcile changes, and retry." });
  return repositorySuccess(undefined);
}

export function prepareRepositoryTransaction(mutations: PreparedRepositoryMutation<unknown>[], now = new Date()): RepositoryResult<PreparedRepositoryTransaction> {
  if (!mutations.length) return repositoryFailure("TRANSACTION_EMPTY", "At least one repository mutation is required.", { recommendedAction: "Prepare the transaction with its intended mutations." });
  const identities = new Set<string>();
  for (const mutation of mutations) { const key = `${mutation.repository}:${mutation.id}:${mutation.operation}`; if (identities.has(key)) return repositoryFailure("TRANSACTION_MUTATION_DUPLICATE", "The same repository mutation was prepared more than once.", { context: { repository: mutation.repository, id: mutation.id }, recommendedAction: "Deduplicate the transaction plan before committing." }); identities.add(key); }
  return repositorySuccess({ id: crypto.randomUUID(), preparedAt: now.toISOString(), mutations: structuredClone(mutations) });
}

export function findById<T extends EntityIdentity>(records: T[], id: string): T | undefined { const found = records.find((record) => record.id === id); return found ? structuredClone(found) : undefined; }
