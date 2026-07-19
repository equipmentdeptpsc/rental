import type { DeurRecord } from "../types";
import { storage } from "@/core/storage";
import { generateDeurNumber, normalizeDeur } from "../services/canonicalDeur";
import { submitDeur, acknowledgeDeur, rejectDeur, reopenDeur } from "../services/reviewLifecycle";
import { deurSyncQueue } from "../offline/deurSyncQueue";
import type { DeurQueueOperation } from "../offline/types";
import { DEUR_STORAGE_KEY, notifyDeurChange } from "../synchronization/deurChangeNotifications";

const STORAGE_KEY = DEUR_STORAGE_KEY;

class DeurRepository {

  getAll(): DeurRecord[] {

    try {
      const records = storage.get<unknown>(STORAGE_KEY);
      return Array.isArray(records) ? records.map((record) => normalizeDeur(record as DeurRecord)) : [];
    } catch {
      return [];
    }

  }

  getById(id: string) {
    return this.getAll().find(
      x => x.id === id
    );
  }

  getByRentalId(
    rentalId: string
  ) {

    return this.getAll().filter(
      x => x.rentalId === rentalId
    );

  }

  create(record: DeurRecord) {

    const all =
      this.getAll();

    const created = normalizeDeur({ ...record, deurNumber: record.deurNumber ?? generateDeurNumber(all) });
    all.push(created);

    return this.persistMutation(all, created, "create", created);

  }

  update(record: DeurRecord) {

    if (!this.getById(record.id)) return undefined;

    const updated =
      this.getAll().map(x =>
        x.id === record.id
          ? record
          : x
      );

    return this.persistMutation(updated, record, "update", record);

  }

  /** Persists a reconciled inbound snapshot without creating an outbound echo. */
  applyInbound(record: DeurRecord) {
    const normalized = normalizeDeur(structuredClone(record));
    const records = this.getAll();
    const exists = records.some((item) => item.id === normalized.id);
    this.saveAll(exists
      ? records.map((item) => item.id === normalized.id ? normalized : item)
      : [...records, normalized]);
    notifyDeurChange(normalized);
    return structuredClone(normalized);
  }

  /** Deletes reconciled inbound state without creating an outbound echo. */
  deleteInbound(id: string) {
    const existing = this.getById(id);
    if (!existing) return false;
    this.saveAll(this.getAll().filter((item) => item.id !== id));
    notifyDeurChange(existing);
    return true;
  }

  submit(id: string, actor: { name: string; id?: string }) { return this.review(id, (record) => submitDeur(record, actor), "submit"); }
  acknowledge(id: string, actor: { name: string; id?: string }) { return this.review(id, (record) => acknowledgeDeur(record, actor), "acknowledge"); }
  reject(id: string, actor: { name: string; id?: string }, reason: string) { return this.review(id, (record) => rejectDeur(record, actor, reason), "reject"); }
  reopen(id: string, actor: { name: string; id?: string }) { return this.review(id, (record) => reopenDeur(record, actor), "reopen"); }

  private review(id: string, operation: (record: DeurRecord) => { success: true; record: DeurRecord } | { success: false; message: string }, queueOperation: DeurQueueOperation) {
    const record = this.getById(id);
    if (!record) return { success: false as const, message: "DEUR not found." };
    const result = operation(record);
    if (!result.success) return result;
    const records = this.getAll().map((item) => item.id === id ? result.record : item);
    return { success: true as const, record: this.persistMutation(records, result.record, queueOperation, result.record) };
  }

  delete(id: string) {

    const deleted = this.getById(id);
    if (!deleted) return undefined;
    this.persistMutation(this.getAll().filter(x => x.id !== id), deleted, "delete", { id: deleted.id });
    return deleted;

  }

  lockBilling(
    deurIds: string[],
    billingStatementId: string
  ) {

    const updated =
      this.getAll().map(deur => {

        if (
          deurIds.includes(deur.id)
        ) {

          return {

            ...deur,

            billingLocked: true,

            billingStatementId,

          };

        }

        return deur;

      });

    this.saveAll(updated);

  }

  unlockBilling(
    billingStatementId: string
  ) {

    const updated =
      this.getAll().map(deur => {

        if (
          deur.billingStatementId !==
          billingStatementId
        ) {

          return deur;

        }

        return {

          ...deur,

          billingLocked: false,

          billingStatementId: undefined,

        };

      });

    this.saveAll(updated);

  }

  private saveAll(
    records: DeurRecord[]
  ) {

    storage.set(STORAGE_KEY, records);

  }

  private persistMutation(records: DeurRecord[], record: DeurRecord, operation: DeurQueueOperation, payload: unknown) {
    const normalized = normalizeDeur(record);
    this.saveAll(records.map((item) => item.id === normalized.id ? normalized : item));
    deurSyncQueue.enqueue({ id: crypto.randomUUID(), aggregateId: normalized.id, aggregateType: "DEUR", operation, payload, createdAt: new Date().toISOString() });
    notifyDeurChange(normalized);
    return normalized;
  }

}

export const deurRepository =
  new DeurRepository();
