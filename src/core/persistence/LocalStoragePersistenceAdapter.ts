import type { IStorageService } from "@/core/storage/IStorageService";
import type { RepositoryResult } from "./contracts";
import { repositoryFailure, repositorySuccess } from "./helpers";

export interface PersistenceAdapter { read<T>(key: string): RepositoryResult<T | null>; write<T>(key: string, value: T): RepositoryResult<void>; remove(key: string): RepositoryResult<void> }
export class LocalStoragePersistenceAdapter implements PersistenceAdapter {
  constructor(private readonly storage: IStorageService) {}
  read<T>(key: string): RepositoryResult<T | null> { try { return repositorySuccess(this.storage.get<T>(key)); } catch (cause) { return repositoryFailure("REPOSITORY_READ_FAILED", `Could not read '${key}'.`, { context: { key }, recoverability: "USER_ACTION_REQUIRED", recommendedAction: "Restore a valid backup or reset the affected storage section.", cause }); } }
  write<T>(key: string, value: T): RepositoryResult<void> { try { this.storage.set(key, structuredClone(value)); return repositorySuccess(undefined); } catch (cause) { return repositoryFailure("REPOSITORY_WRITE_FAILED", `Could not write '${key}'.`, { context: { key }, recoverability: "RETRYABLE", recommendedAction: "Check browser storage availability and retry.", cause }); } }
  remove(key: string): RepositoryResult<void> { try { this.storage.remove(key); return repositorySuccess(undefined); } catch (cause) { return repositoryFailure("REPOSITORY_DELETE_FAILED", `Could not remove '${key}'.`, { context: { key }, recoverability: "RETRYABLE", recommendedAction: "Retry the repository operation.", cause }); } }
}
