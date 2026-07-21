import { storage } from "@/core/storage";
import type { PersistenceAdapter } from "./LocalStoragePersistenceAdapter";
import { LocalStoragePersistenceAdapter } from "./LocalStoragePersistenceAdapter";
import { getRepositoryDescriptor } from "./repositoryCatalog";

export interface RepositoryStorage { load<T>(): T | null; save<T>(value: T): void; remove(): void }
export function createRepositoryStorage(repositoryName: string, adapter: PersistenceAdapter): RepositoryStorage {
  const descriptor = getRepositoryDescriptor(repositoryName);
  if (!descriptor) throw new Error(`REPOSITORY_DESCRIPTOR_MISSING: '${repositoryName}' is not registered.`);
  return {
    load<T>() { const result = adapter.read<T>(descriptor.storageKey); if (!result.success) throw new Error(result.error.message, { cause: result.error.cause }); return result.value; },
    save<T>(value: T) { const result = adapter.write(descriptor.storageKey, value); if (!result.success) throw new Error(result.error.message, { cause: result.error.cause }); },
    remove() { const result = adapter.remove(descriptor.storageKey); if (!result.success) throw new Error(result.error.message, { cause: result.error.cause }); },
  };
}
/** @deprecated Module-singleton bridge until every repository is constructed by the composition root. */
export function createLegacyLocalRepositoryStorage(repositoryName: string): RepositoryStorage { return createRepositoryStorage(repositoryName, new LocalStoragePersistenceAdapter(storage)); }
