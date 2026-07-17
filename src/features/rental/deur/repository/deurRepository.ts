import type { DeurRecord } from "../types";
import { notifyRentalWorkspaceChange } from "@/features/rental/workspace/workspaceRefresh";
import { storage } from "@/core/storage";
import { generateDeurNumber, normalizeDeur } from "../services/canonicalDeur";

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
