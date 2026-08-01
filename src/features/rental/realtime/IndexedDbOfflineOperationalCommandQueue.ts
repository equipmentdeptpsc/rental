import {
  compareOfflineCommands,
  validateOfflineOperationalCommand,
  type OfflineCommandFailureClassification,
  type OfflineCommandScope,
  type OfflineOperationalCommand,
  type OfflineOperationalCommandQueue,
} from "./offlineQueue";

const STORE = "commands";
export const OFFLINE_QUEUE_DATABASE_VERSION = 2;

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("INDEXED_DB_REQUEST_FAILED"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("INDEXED_DB_TRANSACTION_ABORTED"));
    transaction.onerror = () => reject(transaction.error ?? new Error("INDEXED_DB_TRANSACTION_FAILED"));
  });
}

export class IndexedDbOfflineOperationalCommandQueue implements OfflineOperationalCommandQueue {
  private database?: Promise<IDBDatabase>;
  private readonly listeners = new Set<(scope: OfflineCommandScope) => void>();
  private readonly channel?: BroadcastChannel;

  constructor(
    private readonly indexedDb: IDBFactory | undefined = globalThis.indexedDB,
    private readonly databaseName = "equipment-rental.offline-commands.v1",
  ) {
    if (typeof BroadcastChannel !== "undefined") {
      this.channel = new BroadcastChannel(`${databaseName}.changes`);
      this.channel.onmessage = (event: MessageEvent<OfflineCommandScope>) => this.listeners.forEach((listener) => listener(event.data));
    }
  }

  private open(): Promise<IDBDatabase> {
    if (!this.indexedDb) return Promise.reject(new Error("OFFLINE_QUEUE_STORAGE_UNSUPPORTED"));
    return this.database ??= new Promise((resolve, reject) => {
      const request = this.indexedDb!.open(this.databaseName, OFFLINE_QUEUE_DATABASE_VERSION);
      request.onupgradeneeded = (event) => {
        const db = request.result;
        const store = db.objectStoreNames.contains(STORE)
          ? request.transaction!.objectStore(STORE)
          : db.createObjectStore(STORE, { keyPath: "id" });
        const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
        if (oldVersion < 1) {
          store.createIndex("tenantOperator", ["tenantId", "operatorId"], { unique: false });
          store.createIndex("status", "status", { unique: false });
          store.createIndex("idempotencyKey", "idempotencyKey", { unique: true });
          store.createIndex("aggregateOrder", ["tenantId", "operatorId", "rentalLineId", "clientCreatedAt", "id"], { unique: false });
        }
        if (oldVersion < 2 && !store.indexNames.contains("tenantStatus")) {
          store.createIndex("tenantStatus", ["tenantId", "status"], { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("OFFLINE_QUEUE_INITIALIZATION_FAILED"));
      request.onblocked = () => reject(new Error("OFFLINE_QUEUE_UPGRADE_BLOCKED"));
    });
  }

  private async mutate<T>(action: (store: IDBObjectStore) => Promise<T>): Promise<T> {
    const db = await this.open();
    const transaction = db.transaction(STORE, "readwrite");
    const result = await action(transaction.objectStore(STORE));
    await transactionComplete(transaction);
    return result;
  }

  private notify(record: Pick<OfflineOperationalCommand, "tenantId" | "operatorId">): void {
    const scope = { tenantId: record.tenantId, operatorId: record.operatorId ?? "" };
    this.listeners.forEach((listener) => listener(scope));
    this.channel?.postMessage(scope);
  }

  async enqueue(command: OfflineOperationalCommand): Promise<"ENQUEUED" | "DUPLICATE"> {
    validateOfflineOperationalCommand(command);
    try {
      await this.mutate(async (store) => { await requestResult(store.add(structuredClone(command))); });
      this.notify(command); return "ENQUEUED";
    } catch (error) {
      if (error instanceof DOMException && error.name === "ConstraintError") return "DUPLICATE";
      throw error;
    }
  }
  async findById(id: string) {
    const db = await this.open(); const transaction = db.transaction(STORE, "readonly");
    const result = await requestResult(transaction.objectStore(STORE).get(id)) as OfflineOperationalCommand | undefined;
    if (!result) return undefined;
    try { validateOfflineOperationalCommand(result); return structuredClone(result); } catch { return undefined; }
  }
  async listPending(scope: OfflineCommandScope) {
    const db = await this.open(); const transaction = db.transaction(STORE, "readonly");
    const records = await requestResult(transaction.objectStore(STORE).index("tenantOperator").getAll([scope.tenantId, scope.operatorId])) as OfflineOperationalCommand[];
    return records.filter((item) => {
      try { validateOfflineOperationalCommand(item); return item.status !== "TERMINAL_FAILURE"; } catch { return false; }
    }).sort(compareOfflineCommands).map((item) => structuredClone(item));
  }
  async listTerminal(scope: OfflineCommandScope) {
    const db = await this.open(); const transaction = db.transaction(STORE, "readonly");
    const records = await requestResult(transaction.objectStore(STORE).index("tenantOperator").getAll([scope.tenantId, scope.operatorId])) as OfflineOperationalCommand[];
    return records.filter((item) => {
      try { validateOfflineOperationalCommand(item); return item.status === "TERMINAL_FAILURE"; } catch { return false; }
    }).sort(compareOfflineCommands).map((item) => structuredClone(item));
  }
  async claimForReplay(id: string, ownerId: string, expiresAt: string, now: string) {
    return this.mutate(async (store) => {
      const item = await requestResult(store.get(id)) as OfflineOperationalCommand | undefined;
      if (!item || item.status === "TERMINAL_FAILURE" || (item.claim && item.claim.expiresAt > now && item.claim.ownerId !== ownerId)) return undefined;
      const claimed: OfflineOperationalCommand = { ...item, status: "CLAIMED", claim: { ownerId, expiresAt } };
      await requestResult(store.put(claimed)); this.notify(claimed); return structuredClone(claimed);
    });
  }
  private async finish(id: string, ownerId: string, update?: (item: OfflineOperationalCommand) => OfflineOperationalCommand) {
    await this.mutate(async (store) => {
      const item = await requestResult(store.get(id)) as OfflineOperationalCommand | undefined;
      if (!item || item.claim?.ownerId !== ownerId) return;
      if (update) await requestResult(store.put(update(item))); else await requestResult(store.delete(id));
      this.notify(item);
    });
  }
  markSucceeded(id: string, ownerId: string) { return this.finish(id, ownerId); }
  markRetryableFailure(id: string, ownerId: string, failureClassification: OfflineCommandFailureClassification, nextAttemptAt: string, lastAttemptAt: string) {
    return this.finish(id, ownerId, (item) => ({ ...item, status: "RETRYABLE_FAILURE", claim: undefined, failureClassification, nextAttemptAt, lastAttemptAt, attemptCount: item.attemptCount + 1 }));
  }
  markTerminalFailure(id: string, ownerId: string, failureClassification: OfflineCommandFailureClassification, lastAttemptAt: string) {
    return this.finish(id, ownerId, (item) => ({ ...item, status: "TERMINAL_FAILURE", claim: undefined, failureClassification, lastAttemptAt, attemptCount: item.attemptCount + 1 }));
  }
  async releaseExpiredClaims(now: string, scope: OfflineCommandScope) {
    let count = 0;
    for (const item of await this.listPending(scope)) if (item.claim && item.claim.expiresAt <= now) {
      await this.mutate(async (store) => { await requestResult(store.put({ ...item, status: "PENDING", claim: undefined })); }); count += 1;
    }
    return count;
  }
  async deleteAcknowledged(id: string) { await this.mutate(async (store) => { await requestResult(store.delete(id)); }); }
  async clearTestFixtures(scope: OfflineCommandScope, idPrefix: string) {
    let count = 0;
    for (const item of await this.listPending(scope)) if (item.id.startsWith(idPrefix)) { await this.deleteAcknowledged(item.id); count += 1; }
    return count;
  }
  observe(listener: (scope: OfflineCommandScope) => void) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  close(): void { this.channel?.close(); void this.database?.then((db) => db.close()); }
}
