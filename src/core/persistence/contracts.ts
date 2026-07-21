export type RepositoryRecoverability = "RETRYABLE" | "USER_ACTION_REQUIRED" | "MANUAL_RECONCILIATION" | "NOT_RECOVERABLE";
export interface RepositoryError { code: string; message: string; context: Record<string, string | number | boolean | undefined>; recoverability: RepositoryRecoverability; recommendedAction: string; cause?: unknown }
export type RepositoryResult<T> = { success: true; value: T; metadata?: RepositoryOperationMetadata } | { success: false; error: RepositoryError };
export type RepositoryOperation<T> = T | Promise<T>;
export interface RepositoryOperationMetadata { source: "LOCAL_STORAGE" | "INDEXED_DB" | "REMOTE" | "CACHE"; serverTimestamp?: string; version?: string | number; correlationId?: string }
export interface EntityIdentity { id: string }
export interface AuditMetadata { createdAt?: string; createdBy?: string; updatedAt?: string; updatedBy?: string; deletedAt?: string; deletedBy?: string }
export interface VersionMetadata { version?: string | number; etag?: string; updatedAt?: string }
export interface PageRequest { cursor?: string; offset?: number; limit: number }
export interface Page<T> { items: T[]; nextCursor?: string; total?: number }

export interface ReadRepository<T extends EntityIdentity> { getAll(): RepositoryOperation<T[]>; getById(id: string): RepositoryOperation<T | undefined> }
export interface WriteRepository<T extends EntityIdentity> { create(entity: T): RepositoryOperation<void | T | RepositoryResult<T>>; update(entity: T, expectedVersion?: VersionMetadata): RepositoryOperation<void | T | RepositoryResult<T>>; delete(id: string, expectedVersion?: VersionMetadata): RepositoryOperation<void | boolean | T | RepositoryResult<T | undefined>> }
export type CrudRepository<T extends EntityIdentity> = ReadRepository<T> & WriteRepository<T>;
export interface PagingRepository<T extends EntityIdentity> { page(request: PageRequest): RepositoryOperation<Page<T>> }
export interface SoftDeleteRepository<T extends EntityIdentity> { getDeleted(): RepositoryOperation<T[]>; restore(id: string, expectedVersion?: VersionMetadata): RepositoryOperation<void | T | RepositoryResult<T>>; permanentlyDelete(id: string, expectedVersion?: VersionMetadata): RepositoryOperation<void | boolean | RepositoryResult<void>> }

export interface StorageEnvelope<T> { schemaVersion: number; records: T[]; metadata?: { migratedAt?: string; sourceSchemaVersion?: number; lastServerSyncAt?: string } }
export interface RepositoryMigration<T> { fromVersion: number; toVersion: number; migrate(records: unknown[]): RepositoryResult<T[]> }
export interface PreparedRepositoryMutation<T> { id: string; repository: string; operation: "CREATE" | "UPDATE" | "DELETE"; before?: T; after?: T; expectedVersion?: VersionMetadata }
export interface PreparedRepositoryTransaction { id: string; preparedAt: string; mutations: PreparedRepositoryMutation<unknown>[] }
export interface RepositoryTransactionPort { prepare(mutations: PreparedRepositoryMutation<unknown>[]): RepositoryOperation<RepositoryResult<PreparedRepositoryTransaction>>; commit(transaction: PreparedRepositoryTransaction): RepositoryOperation<RepositoryResult<void>>; rollback(transaction: PreparedRepositoryTransaction): RepositoryOperation<RepositoryResult<void>> }
export interface RepositoryDescriptor { name: string; storageKey: string; schemaVersion: number; capabilities: Array<"CRUD" | "PAGING" | "SOFT_DELETE" | "MIGRATION" | "OPTIMISTIC_CONCURRENCY" | "TRANSACTION_PREPARATION" | "BACKGROUND_SYNC"> }
