import type { DeurRecord } from "../types";
import { notifyRentalWorkspaceChange } from "@/features/rental/workspace/workspaceRefresh";
import { storage } from "@/core/storage";
import { generateDeurNumber, normalizeDeur } from "../services/canonicalDeur";
import { submitDeur, acknowledgeDeur, rejectDeur, reopenDeur } from "../services/reviewLifecycle";

const STORAGE_KEY = "equipment-rental-deur";

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

    this.saveAll(all);
    notifyRentalWorkspaceChange(record.rentalId);
    return created;

  }

  update(record: DeurRecord) {

    const updated =
      this.getAll().map(x =>
        x.id === record.id
          ? record
          : x
      );

    this.saveAll(updated);
    notifyRentalWorkspaceChange(record.rentalId);

  }

  submit(id: string, actor: { name: string; id?: string }) { return this.review(id, (record) => submitDeur(record, actor)); }
  acknowledge(id: string, actor: { name: string; id?: string }) { return this.review(id, (record) => acknowledgeDeur(record, actor)); }
  reject(id: string, actor: { name: string; id?: string }, reason: string) { return this.review(id, (record) => rejectDeur(record, actor, reason)); }
  reopen(id: string, actor: { name: string; id?: string }) { return this.review(id, (record) => reopenDeur(record, actor)); }

  private review(id: string, operation: (record: DeurRecord) => { success: true; record: DeurRecord } | { success: false; message: string }) {
    const record = this.getById(id);
    if (!record) return { success: false as const, message: "DEUR not found." };
    const result = operation(record);
    if (!result.success) return result;
    this.update(result.record);
    return { success: true as const, record: this.getById(id)! };
  }

  delete(id: string) {

    this.saveAll(
      this.getAll().filter(
        x => x.id !== id
      )
    );

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

}

export const deurRepository =
  new DeurRepository();
